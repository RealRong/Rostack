import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type { Point } from '@whiteboard/core/types'
import type {
  SceneHit,
  SceneHitItem,
  SceneSpatial
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const DEFAULT_HIT_THRESHOLD = 8

type HitWinner = {
  target: SceneHitItem
  distance: number
  order: number
}

const readNodeDistance = (input: {
  state: WorkingState
  nodeId: string
  point: Point
}): number | undefined => {
  const graph = input.state.graph.nodes.get(input.nodeId)
  const state = input.state.graph.state.node.get(input.nodeId)
  if (!graph || state?.hidden) {
    return undefined
  }

  return nodeApi.hit.distanceToPoint({
    node: graph.base.node,
    rect: graph.geometry.rect,
    rotation: graph.geometry.rotation,
    point: input.point
  })
}

const readEdgeDistance = (input: {
  state: WorkingState
  edgeId: string
  point: Point
}): number | undefined => {
  const edge = input.state.graph.edges.get(input.edgeId)
  return edgeApi.hit.distanceToViewPoint({
    path: edge?.route,
    point: input.point
  })
}

const readMindmapDistance = (input: {
  state: WorkingState
  mindmapId: string
  point: Point
}): number | undefined => {
  const bounds = input.state.graph.owners.mindmaps.get(input.mindmapId)?.tree.bbox
  if (!bounds) {
    return undefined
  }

  return geometryApi.rect.containsPoint(input.point, bounds)
    ? 0
    : geometryApi.rect.distanceToPoint(input.point, bounds)
}

const readGroupDistance = (input: {
  state: WorkingState
  groupId: string
  point: Point
}): number | undefined => {
  const bounds = input.state.graph.owners.groups.get(input.groupId)?.frame.bounds
  if (!bounds) {
    return undefined
  }

  return geometryApi.rect.containsPoint(input.point, bounds)
    ? 0
    : geometryApi.rect.distanceToPoint(input.point, bounds)
}

export const createHitRead = (input: {
  state: () => WorkingState
  spatial: SceneSpatial
}): SceneHit => ({
  node: ({
    point,
    threshold,
    excludeIds
  }: {
    point: Point
    threshold?: number
    excludeIds?: readonly string[]
  }) => {
    const radius = threshold ?? DEFAULT_HIT_THRESHOLD
    const exclude = excludeIds?.length
      ? new Set(excludeIds)
      : undefined
    let winner: {
      id: string
      distance: number
      order: number
    } | undefined

    input.spatial.candidates(geometryApi.rect.fromPoint(point, radius), {
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

      winner = geometryApi.scalar.pickPreferred(
        winner,
        {
          id: record.item.id,
          distance,
          order: record.order
        },
        (candidate) => candidate.distance,
        (candidate) => candidate.order
      )
    })

    return winner?.id
  },
  edge: ({
    point,
    threshold,
    excludeIds
  }: {
    point: Point
    threshold?: number
    excludeIds?: readonly string[]
  }) => {
    const radius = threshold ?? DEFAULT_HIT_THRESHOLD
    const exclude = excludeIds?.length
      ? new Set(excludeIds)
      : undefined
    let winner: {
      id: string
      distance: number
      order: number
    } | undefined

    input.spatial.candidates(geometryApi.rect.fromPoint(point, radius), {
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

      winner = geometryApi.scalar.pickPreferred(
        winner,
        {
          id: record.item.id,
          distance,
          order: record.order
        },
        (candidate) => candidate.distance,
        (candidate) => candidate.order
      )
    })

    return winner?.id
  },
  item: ({
    point,
    threshold,
    kinds,
    exclude
  }: {
    point: Point
    threshold?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
      group: readonly string[]
    }>
  }) => {
    const radius = threshold ?? DEFAULT_HIT_THRESHOLD
    const kindSet = kinds
      ? new Set(kinds)
      : undefined
    const state = input.state()
    let winner: HitWinner | undefined

    input.spatial.candidates(geometryApi.rect.fromPoint(point, radius), {
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
          winner = geometryApi.scalar.pickPreferred(
            winner,
            {
              target: {
                kind: 'node',
                id: record.item.id
              },
              distance,
              order: record.order
            },
            (candidate) => candidate.distance,
            (candidate) => candidate.order
          )
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
          winner = geometryApi.scalar.pickPreferred(
            winner,
            {
              target: {
                kind: 'edge',
                id: record.item.id
              },
              distance,
              order: record.order
            },
            (candidate) => candidate.distance,
            (candidate) => candidate.order
          )
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
          winner = geometryApi.scalar.pickPreferred(
            winner,
            {
              target: {
                kind: 'mindmap',
                id: record.item.id
              },
              distance,
              order: record.order
            },
            (candidate) => candidate.distance,
            (candidate) => candidate.order
          )
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

        winner = geometryApi.scalar.pickPreferred(
          winner,
          {
            target: {
              kind: 'group',
              id: groupId
            },
            distance,
            order: Number.MIN_SAFE_INTEGER
          },
          (candidate) => candidate.distance,
          (candidate) => candidate.order
        )
      })
    }

    return winner?.target
  }
})
