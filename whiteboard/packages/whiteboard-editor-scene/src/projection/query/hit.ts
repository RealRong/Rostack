import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { SceneQuery } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const DEFAULT_HIT_THRESHOLD = 8

export const toRect = (
  point: Point,
  radius: number
): Rect => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2
})

const readRectDistance = (
  rect: Rect,
  point: Point
): number => {
  const dx = point.x < rect.x
    ? rect.x - point.x
    : point.x > rect.x + rect.width
      ? point.x - (rect.x + rect.width)
      : 0
  const dy = point.y < rect.y
    ? rect.y - point.y
    : point.y > rect.y + rect.height
      ? point.y - (rect.y + rect.height)
      : 0

  return Math.hypot(dx, dy)
}

type HitTarget =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'group'
      id: GroupId
    }

type HitWinner = {
  target: HitTarget
  distance: number
  order: number
}

const pickBetter = (
  current: HitWinner | undefined,
  next: HitWinner
): HitWinner => {
  if (!current) {
    return next
  }
  if (next.distance < current.distance) {
    return next
  }
  if (next.distance > current.distance) {
    return current
  }
  if (next.order > current.order) {
    return next
  }
  return current
}

const readNodeDistance = (input: {
  state: WorkingState
  nodeId: NodeId
  point: Point
}): number | undefined => {
  const graph = input.state.graph.nodes.get(input.nodeId)
  const state = input.state.graph.state.node.get(input.nodeId)
  if (!graph || state?.hidden) {
    return undefined
  }

  return nodeApi.outline.containsPoint(
    graph.base.node,
    graph.geometry.rect,
    graph.geometry.rotation,
    input.point
  )
    ? 0
    : nodeApi.outline.distanceToOutline(
        graph.base.node,
        graph.geometry.rect,
        graph.geometry.rotation,
        input.point
      )
}

const readEdgeDistance = (input: {
  state: WorkingState
  edgeId: EdgeId
  point: Point
}): number | undefined => {
  const edge = input.state.graph.edges.get(input.edgeId)
  if (!edge?.route.svgPath) {
    return undefined
  }

  const distance = edgeApi.hit.distanceToPath({
    path: {
      points: [...edge.route.points],
      segments: [...edge.route.segments]
    },
    point: input.point
  })

  return Number.isFinite(distance)
    ? distance
    : undefined
}

const readMindmapDistance = (input: {
  state: WorkingState
  mindmapId: MindmapId
  point: Point
}): number | undefined => {
  const bounds = input.state.graph.owners.mindmaps.get(input.mindmapId)?.tree.bbox
  if (!bounds) {
    return undefined
  }

  return geometryApi.rect.containsPoint(input.point, bounds)
    ? 0
    : readRectDistance(bounds, input.point)
}

const readGroupDistance = (input: {
  state: WorkingState
  groupId: GroupId
  point: Point
}): number | undefined => {
  const bounds = input.state.graph.owners.groups.get(input.groupId)?.frame.bounds
  if (!bounds) {
    return undefined
  }

  return geometryApi.rect.containsPoint(input.point, bounds)
    ? 0
    : readRectDistance(bounds, input.point)
}

export const createHitRead = (input: {
  state: () => WorkingState
  spatial: SceneQuery['spatial']
}): SceneQuery['hit'] => ({
  node: ({
    point,
    threshold,
    excludeIds
  }) => {
    const radius = threshold ?? DEFAULT_HIT_THRESHOLD
    const exclude = excludeIds?.length
      ? new Set(excludeIds)
      : undefined
    let winner: {
      id: NodeId
      distance: number
      order: number
    } | undefined

    input.spatial.candidates(toRect(point, radius), {
      kinds: ['node']
    }).records.forEach((record) => {
      if (record.item.kind !== 'node' || exclude?.has(record.item.id)) {
        return
      }

      const distance = readNodeDistance({
        state: input.state(),
        nodeId: record.item.id,
        point
      })
      if (distance === undefined || distance > radius) {
        return
      }

      if (
        !winner
        || distance < winner.distance
        || (distance === winner.distance && record.order > winner.order)
      ) {
        winner = {
          id: record.item.id,
          distance,
          order: record.order
        }
      }
    })

    return winner?.id
  },
  edge: ({
    point,
    threshold,
    excludeIds
  }) => {
    const radius = threshold ?? DEFAULT_HIT_THRESHOLD
    const exclude = excludeIds?.length
      ? new Set(excludeIds)
      : undefined
    let winner: {
      id: EdgeId
      distance: number
      order: number
    } | undefined

    input.spatial.candidates(toRect(point, radius), {
      kinds: ['edge']
    }).records.forEach((record) => {
      if (record.item.kind !== 'edge' || exclude?.has(record.item.id)) {
        return
      }

      const distance = readEdgeDistance({
        state: input.state(),
        edgeId: record.item.id,
        point
      })
      if (distance === undefined || distance > radius) {
        return
      }

      if (
        !winner
        || distance < winner.distance
        || (distance === winner.distance && record.order > winner.order)
      ) {
        winner = {
          id: record.item.id,
          distance,
          order: record.order
        }
      }
    })

    return winner?.id
  },
  item: ({
    point,
    threshold,
    kinds,
    exclude
  }) => {
    const radius = threshold ?? DEFAULT_HIT_THRESHOLD
    const kindSet = kinds
      ? new Set(kinds)
      : undefined
    const state = input.state()
    let winner: HitWinner | undefined

    input.spatial.candidates(toRect(point, radius), {
      kinds: kinds?.filter((kind) => kind !== 'group') as
        | readonly ('node' | 'edge' | 'mindmap')[]
        | undefined
    }).records.forEach((record) => {
      switch (record.item.kind) {
        case 'node': {
          if (exclude?.node?.includes(record.item.id)) {
            return
          }
          const distance = readNodeDistance({
            state,
            nodeId: record.item.id,
            point
          })
          if (distance === undefined || distance > radius) {
            return
          }
          winner = pickBetter(winner, {
            target: {
              kind: 'node',
              id: record.item.id
            },
            distance,
            order: record.order
          })
          return
        }
        case 'edge': {
          if (exclude?.edge?.includes(record.item.id)) {
            return
          }
          const distance = readEdgeDistance({
            state,
            edgeId: record.item.id,
            point
          })
          if (distance === undefined || distance > radius) {
            return
          }
          winner = pickBetter(winner, {
            target: {
              kind: 'edge',
              id: record.item.id
            },
            distance,
            order: record.order
          })
          return
        }
        case 'mindmap': {
          if (exclude?.mindmap?.includes(record.item.id)) {
            return
          }
          const distance = readMindmapDistance({
            state,
            mindmapId: record.item.id,
            point
          })
          if (distance === undefined || distance > radius) {
            return
          }
          winner = pickBetter(winner, {
            target: {
              kind: 'mindmap',
              id: record.item.id
            },
            distance,
            order: record.order
          })
        }
      }
    })

    if (kindSet?.has('group')) {
      state.graph.owners.groups.forEach((group, groupId) => {
        if (exclude?.group?.includes(groupId)) {
          return
        }

        const distance = readGroupDistance({
          state,
          groupId,
          point
        })
        if (distance === undefined || distance > radius) {
          return
        }

        winner = pickBetter(winner, {
          target: {
            kind: 'group',
            id: groupId
          },
          distance,
          order: Number.MIN_SAFE_INTEGER
        })
      })
    }

    return winner?.target
  }
})
