import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeModel,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projector/phase'
import type { OwnerRef, Query, SceneItem } from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { readGroupSignatureFromTarget } from '../model/graph/group'
import { readRelatedEdgeIds, readTreeDescendants } from '../model/index/read'
import { createSpatialRead } from '../model/spatial/query'
import type { SpatialIndexState } from '../model/spatial/state'

const DEFAULT_HIT_THRESHOLD = 8

const toRect = (
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

const isFrameView = (
  state: WorkingState,
  nodeId: NodeId
) => state.graph.nodes.get(nodeId)?.base.node.type === 'frame'

const readFrameRect = (
  state: WorkingState,
  nodeId: NodeId
) => {
  const view = state.graph.nodes.get(nodeId)
  return view?.base.node.type === 'frame'
    ? view.geometry.rect
    : undefined
}

const readFrameCandidates = (input: {
  state: WorkingState
  records: ReturnType<Query['spatial']['point']> | ReturnType<Query['spatial']['rect']>
}): readonly {
  id: NodeId
  rect: Rect
  order: number
}[] => input.records.flatMap((record) => {
  if (record.item.kind !== 'node') {
    return []
  }

  const rect = readFrameRect(input.state, record.item.id)
  return rect
    ? [{
        id: record.item.id,
        rect,
        order: record.order
      }]
    : []
})

const createFrameRead = (input: {
  state: () => WorkingState
  spatial: Query['spatial']
}): Query['frame'] => ({
  point: (point) => input.spatial.point(point, {
    kinds: ['node']
  }).flatMap((record) => record.item.kind === 'node' && isFrameView(input.state(), record.item.id)
    ? [record.item.id]
    : []),
  rect: (rect) => input.spatial.rect(rect, {
    kinds: ['node']
  }).flatMap((record) => {
    if (record.item.kind !== 'node') {
      return []
    }

    const frameRect = readFrameRect(input.state(), record.item.id)
    return frameRect && geometryApi.rect.contains(frameRect, rect)
      ? [record.item.id]
      : []
  }),
  pick: (point, options) => nodeApi.frame.pick({
    candidates: readFrameCandidates({
      state: input.state(),
      records: input.spatial.point(point, {
        kinds: ['node']
      })
    }),
    point,
    excludeIds: options?.excludeIds?.length
      ? new Set(options.excludeIds)
      : undefined
  }),
  parent: (nodeId, options) => {
    const rect = input.state().graph.nodes.get(nodeId)?.geometry.rect
    if (!rect) {
      return undefined
    }

    return nodeApi.frame.pickParent({
      candidates: readFrameCandidates({
        state: input.state(),
        records: input.spatial.rect(rect, {
          kinds: ['node']
        })
      }),
      rect,
      nodeId,
      excludeIds: options?.excludeIds?.length
        ? new Set(options.excludeIds)
        : undefined
    })
  },
  descendants: (nodeIds) => readTreeDescendants(input.state().indexes, nodeIds)
})

const resolveMindmapId = (
  state: WorkingState,
  value: string
): MindmapId | undefined => {
  if (state.graph.owners.mindmaps.has(value as MindmapId)) {
    return value as MindmapId
  }

  const owner = state.indexes.ownerByNode.get(value as NodeId)
  return owner?.kind === 'mindmap'
    ? owner.id
    : undefined
}

const toGroupTarget = (
  items: readonly {
    kind: 'node' | 'edge'
    id: string
  }[]
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: items.flatMap((item) => item.kind === 'node'
    ? [item.id as NodeId]
    : []),
  edgeIds: items.flatMap((item) => item.kind === 'edge'
    ? [item.id as EdgeId]
    : [])
})

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

const createHitRead = (input: {
  state: () => WorkingState
  spatial: Query['spatial']
}): Query['hit'] => ({
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

export const createEditorSceneRead = (runtime: {
  revision: () => Revision
  state: () => WorkingState
  items: () => readonly SceneItem[]
  spatial: () => SpatialIndexState
  canNodeConnect?: (input: {
    node: NodeModel
    owner?: OwnerRef
  }) => boolean
}): Query => {
  const spatial = createSpatialRead({
    state: runtime.spatial
  })
  const frame = createFrameRead({
    state: runtime.state,
    spatial
  })
  const hit = createHitRead({
    state: runtime.state,
    spatial
  })

  return {
    revision: runtime.revision,
    node: {
      get: (id) => runtime.state().graph.nodes.get(id),
      idsInRect: (rect, options) => {
        const match = options?.match ?? 'touch'
        const policy = options?.policy ?? 'default'
        const exclude = options?.exclude?.length
          ? new Set(options.exclude)
          : undefined
        const candidateIds = spatial.rect(rect, {
          kinds: ['node']
        })
          .map((record) => record.item.id)
          .filter((nodeId) => !exclude?.has(nodeId))

        return nodeApi.hit.filterIdsInRect({
          rect,
          candidateIds,
          match,
          policy,
          getEntry: (nodeId) => {
            const current = runtime.state().graph.nodes.get(nodeId)
            return current
              ? {
                  node: nodeApi.projection.toSpatial({
                    node: current.base.node,
                    rect: current.geometry.rect,
                    rotation: current.geometry.rotation
                  }),
                  rect: current.geometry.rect,
                  rotation: current.geometry.rotation
                }
              : undefined
          },
          matchEntry: nodeApi.hit.matchRect
        })
      }
    },
    edge: {
      get: (id) => runtime.state().graph.edges.get(id),
      related: (nodeIds) => readRelatedEdgeIds(runtime.state().indexes, nodeIds),
      idsInRect: (rect, options) => {
        const mode = options?.match ?? 'touch'
        return spatial.rect(rect, {
          kinds: ['edge']
        }).flatMap((record) => {
          const edgeId = record.item.id
          const current = runtime.state().graph.edges.get(edgeId)
          return current && current.route.ends && edgeApi.hit.test({
            path: {
              points: [...current.route.points],
              segments: [...current.route.segments]
            },
            queryRect: rect,
            mode
          })
            ? [edgeId]
            : []
        })
      },
      connectCandidates: (rect) => spatial.rect(rect, {
        kinds: ['node']
      }).flatMap((record) => {
        if (record.item.kind !== 'node') {
          return []
        }

        const current = runtime.state().graph.nodes.get(record.item.id)
        if (!current) {
          return []
        }

        const canConnect = runtime.canNodeConnect
          ? runtime.canNodeConnect({
              node: current.base.node,
              owner: current.base.owner
            })
          : !current.base.node.locked
        if (!canConnect) {
          return []
        }

        return [{
          nodeId: current.base.node.id,
          node: nodeApi.projection.toSpatial({
            node: current.base.node,
            rect: current.geometry.rect,
            rotation: current.geometry.rotation
          }),
          geometry: {
            ...current.geometry.outline,
            rotation: current.geometry.rotation
          }
        }]
      })
    },
    mindmap: {
      get: (id) => runtime.state().graph.owners.mindmaps.get(id),
      resolve: (value) => resolveMindmapId(runtime.state(), value),
      structure: (value) => {
        const mindmapId = resolveMindmapId(
          runtime.state(),
          value as string
        ) ?? (runtime.state().graph.owners.mindmaps.has(value as MindmapId)
          ? value as MindmapId
          : undefined)
        return mindmapId
          ? runtime.state().graph.owners.mindmaps.get(mindmapId)?.structure
          : undefined
      },
      navigate: (input) => {
        const structure = runtime.state().graph.owners.mindmaps.get(input.id)?.structure
        return structure
          ? mindmapApi.tree.navigate({
              tree: structure.tree,
              fromNodeId: input.fromNodeId,
              direction: input.direction
            })
          : undefined
      }
    },
    group: {
      get: (id) => runtime.state().graph.owners.groups.get(id),
      ofNode: (nodeId) => runtime.state().graph.nodes.get(nodeId)?.base.node.groupId,
      ofEdge: (edgeId) => runtime.state().graph.edges.get(edgeId)?.base.edge.groupId,
      target: (groupId) => {
        const group = runtime.state().graph.owners.groups.get(groupId)
        return group
          ? toGroupTarget(group.structure.items)
          : undefined
      },
      exact: (target: SelectionTarget) => {
        const normalized = selectionApi.target.normalize(target)
        const signature = readGroupSignatureFromTarget(normalized)
        return runtime.state().indexes.groupIdsBySignature.get(signature) ?? []
      }
    },
    spatial,
    snap: (rect) => nodeApi.snap.buildCandidates(
      spatial.rect(rect, {
        kinds: ['node']
      }).flatMap((record) => {
        if (record.item.kind !== 'node') {
          return []
        }

        const view = runtime.state().graph.nodes.get(record.item.id)
        return view
          ? [{
              id: record.item.id,
              rect: view.geometry.rect
            }]
          : []
      })
    ),
    frame,
    hit,
    items: runtime.items
  }
}
