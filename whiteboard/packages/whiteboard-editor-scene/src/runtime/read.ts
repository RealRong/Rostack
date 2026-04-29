import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type {
  NodeCapabilityInput,
  Query,
  SceneBackgroundView,
  SceneViewSnapshot,
  SceneItem,
  SelectionMembersView
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { readGroupSignatureFromTarget } from '../model/graph/group'
import { createDocumentResolver } from '../model/document/resolver'
import { readRelatedEdgeIds, readTreeDescendants } from '../model/index/read'
import { createSpatialRead } from '../model/spatial/query'
import type { SpatialIndexState } from '../model/spatial/state'

const DEFAULT_HIT_THRESHOLD = 8
const BASE_BACKGROUND_STEP = 24
const MIN_BACKGROUND_STEP = 14
const DEFAULT_BACKGROUND_COLOR = 'rgb(from var(--ui-text-primary) r g b / 0.08)'

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

const resolveBackgroundStep = (zoom: number) => {
  let step = BASE_BACKGROUND_STEP * Math.max(zoom, 0.0001)
  while (step < MIN_BACKGROUND_STEP) {
    step *= 2
  }
  return step
}

const readBackgroundView = (input: {
  state: WorkingState
  view: SceneViewSnapshot
}): SceneBackgroundView => {
  const background = input.state.document.background
  const type = background?.type ?? 'none'

  if (type === 'none') {
    return {
      type: 'none'
    }
  }

  return {
    type,
    color: background?.color ?? DEFAULT_BACKGROUND_COLOR,
    step: resolveBackgroundStep(input.view.zoom),
    offset: {
      x: input.view.center.x * input.view.zoom,
      y: input.view.center.y * input.view.zoom
    }
  }
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

const expandMoveNodeIds = (input: {
  target: SelectionTarget
  state: WorkingState
  spatial: Query['spatial']
}) => {
  const normalized = selectionApi.target.normalize(input.target)
  const expandedNodeIds = new Set(normalized.nodeIds)
  const frameQueue = normalized.nodeIds.filter((nodeId) => (
    input.state.graph.nodes.get(nodeId)?.base.node.type === 'frame'
  ))

  while (frameQueue.length > 0) {
    const frameId = frameQueue.pop()
    const frameRect = frameId
      ? input.state.graph.nodes.get(frameId)?.geometry.rect
      : undefined
    if (!frameId || !frameRect) {
      continue
    }

    input.spatial.rect(frameRect, {
      kinds: ['node']
    }).forEach((record) => {
      if (record.item.kind !== 'node' || record.item.id === frameId) {
        return
      }

      const current = input.state.graph.nodes.get(record.item.id)
      if (
        !current
        || expandedNodeIds.has(current.base.node.id)
        || !geometryApi.rect.contains(frameRect, current.geometry.rect)
      ) {
        return
      }

      expandedNodeIds.add(current.base.node.id)
      if (current.base.node.type === 'frame') {
        frameQueue.push(current.base.node.id)
      }
    })
  }

  return {
    normalized,
    expandedNodeIds
  }
}

const readSelectionMembersKey = (
  target: SelectionTarget
) => `${target.nodeIds.join('\0')}\u0001${target.edgeIds.join('\0')}`

const createSelectionRead = (input: {
  state: () => WorkingState
  spatial: Query['spatial']
  nodeCapability?: NodeCapabilityInput
}): Query['selection'] => {
  const readMembers = (
    target: SelectionTarget
  ): SelectionMembersView => {
    const normalized = selectionApi.target.normalize(target)
    const state = input.state()
    const nodes = normalized.nodeIds.flatMap((nodeId) => {
      const current = state.graph.nodes.get(nodeId)?.base.node
      return current ? [current] : []
    })
    const edges = normalized.edgeIds.flatMap((edgeId) => {
      const current = state.graph.edges.get(edgeId)?.base.edge
      return current ? [current] : []
    })

    return {
      target: normalized,
      key: readSelectionMembersKey(normalized),
      nodes,
      edges,
      primaryNode: nodes[0],
      primaryEdge: edges[0]
    } satisfies SelectionMembersView
  }

  const readSummary = (
    target: SelectionTarget
  ) => {
    const members = readMembers(target)
    return selectionApi.derive.summary({
      target: members.target,
      nodes: members.nodes,
      edges: members.edges,
      readNodeRect: (node) => input.state().graph.nodes.get(node.id)?.geometry.rect,
      readEdgeBounds: (edge) => input.state().graph.edges.get(edge.id)?.route.bounds,
      resolveNodeTransformBehavior: (node) => {
        const capability = input.nodeCapability?.capability(node)
        return capability
          ? nodeApi.transform.resolveBehavior(node, {
              role: capability.role,
              resize: capability.resize
            })
          : undefined
      }
    })
  }

  const readAffordance = (
    target: SelectionTarget
  ) => {
    const summary = readSummary(target)
    return selectionApi.derive.affordance({
      selection: summary,
      resolveNodeRole: (node) => (
        input.nodeCapability?.capability(node).role ?? 'content'
      ),
      resolveNodeTransformCapability: (node) => {
        const capability = input.nodeCapability?.capability(node)
        return {
          resize: capability?.resize ?? false,
          rotate: capability?.rotate ?? false
        }
      }
    })
  }

  return {
    members: readMembers,
    summary: readSummary,
    affordance: readAffordance,
    selected: {
      node: (target, nodeId) => selectionApi.target.normalize(target).nodeIds.includes(nodeId),
      edge: (target, edgeId) => selectionApi.target.normalize(target).edgeIds.includes(edgeId)
    },
    move: (target) => {
      const state = input.state()
      const {
        normalized,
        expandedNodeIds
      } = expandMoveNodeIds({
        target,
        state,
        spatial: input.spatial
      })
      const relatedEdgeIds = new Set([
        ...normalized.edgeIds,
        ...readRelatedEdgeIds(state.indexes, expandedNodeIds)
      ])

      return {
        nodes: [...expandedNodeIds].flatMap((nodeId) => {
          const current = state.graph.nodes.get(nodeId)
          return current
            ? [nodeApi.patch.toSpatial({
                node: current.base.node,
                rect: current.geometry.rect,
                rotation: current.geometry.rotation
              })]
            : []
        }),
        edges: [...relatedEdgeIds].flatMap<Edge>((edgeId) => {
          const current = state.graph.edges.get(edgeId)?.base.edge
          return current ? [current] : []
        })
      }
    },
    bounds: (target) => {
      const normalized = selectionApi.target.normalize(target)
      const state = input.state()
      const nodeBounds = normalized.nodeIds.flatMap((nodeId) => {
        const current = state.graph.nodes.get(nodeId)
        return current ? [current.geometry.bounds] : []
      })
      const edgeBounds = normalized.edgeIds.flatMap((edgeId) => {
        const current = state.graph.edges.get(edgeId)?.route.bounds
        return current ? [current] : []
      })

      return geometryApi.rect.boundingRect([
        ...nodeBounds,
        ...edgeBounds
      ])
    }
  }
}

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

const createViewRead = (input: {
  state: () => WorkingState
  view: () => SceneViewSnapshot
  hit: Query['hit']
  spatial: Query['spatial']
}): Query['view'] => ({
  zoom: () => input.view().zoom,
  center: () => input.view().center,
  worldRect: () => input.view().worldRect,
  screenPoint: (point) => {
    const view = input.view()
    return geometryApi.viewport.projectPoint({
      point,
      zoom: view.zoom,
      worldRect: view.worldRect
    })
  },
  screenRect: (rect) => {
    const view = input.view()
    return geometryApi.viewport.projectRect({
      rect,
      zoom: view.zoom,
      worldRect: view.worldRect
    })
  },
  background: () => readBackgroundView({
    state: input.state(),
    view: input.view()
  }),
  visible: (options) => {
    const view = input.view()
    return input.spatial.rect(view.worldRect, options)
  },
  pick: ({
    point,
    radius,
    kinds,
    exclude
  }) => {
    const view = input.view()
    const resolvedRadius = radius ?? (
      DEFAULT_HIT_THRESHOLD / Math.max(view.zoom, 0.0001)
    )
    const rect = toRect(point, resolvedRadius)
    const candidates = input.spatial.candidates(rect, {
      kinds: kinds?.filter((kind) => kind !== 'group') as
        | readonly ('node' | 'edge' | 'mindmap')[]
        | undefined
    })
    const target = input.hit.item({
      point,
      threshold: resolvedRadius,
      kinds,
      exclude
    })

    return {
      rect,
      target,
      stats: {
        ...candidates.stats,
        hits: target ? 1 : 0,
        latency: 0
      }
    }
  }
})

const createChromeRead = (input: {
  state: () => WorkingState
  view: Query['view']
}): Query['chrome'] => ({
  marquee: () => {
    const marquee = input.state().graph.state.chrome.preview.marquee

    return marquee
      ? {
          rect: input.view.screenRect(marquee.worldRect),
          match: marquee.match
        }
      : undefined
  },
  draw: () => input.state().graph.state.chrome.preview.draw,
  guides: () => input.state().graph.state.chrome.preview.guides,
  edgeGuide: () => input.state().graph.state.chrome.preview.edgeGuide
})

const createBoundsRead = (input: {
  state: () => WorkingState
}): Query['bounds'] => () => {
  const state = input.state()
  return geometryApi.rect.boundingRect([
    ...[...state.graph.nodes.values()].map((node) => node.geometry.bounds),
    ...[...state.graph.edges.values()].flatMap((edge) => (
      edge.route.bounds
        ? [edge.route.bounds]
        : []
    )),
    ...[...state.graph.owners.mindmaps.values()].flatMap((mindmap) => (
      mindmap.tree.bbox
        ? [mindmap.tree.bbox]
        : []
    )),
    ...[...state.graph.owners.groups.values()].flatMap((group) => (
      group.frame.bounds
        ? [group.frame.bounds]
        : []
    ))
  ])
}

export const createEditorSceneRead = (runtime: {
  revision: () => Revision
  state: () => WorkingState
  items: () => WorkingState['items']
  spatial: () => SpatialIndexState
  nodeCapability?: NodeCapabilityInput
  view: () => SceneViewSnapshot
}): Query => {
  const spatial = createSpatialRead({
    state: runtime.spatial
  })
  const document = createDocumentResolver({
    state: runtime.state
  })
  const frame = createFrameRead({
    state: runtime.state,
    spatial
  })
  const selection = createSelectionRead({
    state: runtime.state,
    spatial,
    nodeCapability: runtime.nodeCapability
  })
  const hit = createHitRead({
    state: runtime.state,
    spatial
  })
  const view = createViewRead({
    state: runtime.state,
    view: runtime.view,
    hit,
    spatial
  })
  const chrome = createChromeRead({
    state: runtime.state,
    view
  })
  const bounds = createBoundsRead({
    state: runtime.state
  })

  return {
    revision: runtime.revision,
    bounds,
    document: {
      get: () => runtime.state().document.snapshot,
      background: () => runtime.state().document.background,
      node: document.node,
      edge: document.edge,
      nodeIds: document.nodeIds,
      edgeIds: document.edgeIds,
      slice: document.slice
    },
    node: {
      get: (id) => runtime.state().graph.nodes.get(id),
      draft: (id) => runtime.state().draft.node.get(id),
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
                  node: nodeApi.patch.toSpatial({
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

        const canConnect = runtime.nodeCapability
          ? runtime.nodeCapability.capability(current.base.node).connect
          : !current.base.node.locked
        if (!canConnect) {
          return []
        }

        return [{
          nodeId: current.base.node.id,
          node: nodeApi.patch.toSpatial({
            node: current.base.node,
            rect: current.geometry.rect,
            rotation: current.geometry.rotation
          }),
          geometry: {
            ...current.geometry.outline,
            rotation: current.geometry.rotation
          }
        }]
      }),
      capability: (edgeId) => {
        const edge = runtime.state().graph.edges.get(edgeId)?.base.edge
        return edge
          ? edgeApi.capability({
              edge,
              readNodeLocked: (nodeId) => Boolean(
                runtime.state().graph.nodes.get(nodeId)?.base.node.locked
              )
            })
          : undefined
      },
      editable: (edgeId) => {
        const view = runtime.state().graph.edges.get(edgeId)
        const capability = view
          ? edgeApi.capability({
              edge: view.base.edge,
              readNodeLocked: (nodeId) => Boolean(
                runtime.state().graph.nodes.get(nodeId)?.base.node.locked
              )
            })
          : undefined
        return capability?.editRoute
          ? view
          : undefined
      },
      routePoints: ({ edgeId, activeRouteIndex }) => {
        const edge = runtime.state().graph.edges.get(edgeId)
        return edge
          ? edgeApi.routePoints({
              edgeId,
              edge: edge.base.edge,
              handles: edge.route.handles,
              activeRouteIndex
            })
          : []
      },
      box: (edgeId) => {
        const edge = runtime.state().graph.edges.get(edgeId)
        return edgeApi.box({
          rect: edge?.route.bounds,
          edge: edge?.base.edge
        })
      },
      chrome: ({
        edgeId,
        activeRouteIndex,
        tool,
        interaction,
        edit
      }) => {
        const edge = runtime.state().graph.edges.get(edgeId)
        const capability = edge
          ? edgeApi.capability({
              edge: edge.base.edge,
              readNodeLocked: (nodeId) => Boolean(
                runtime.state().graph.nodes.get(nodeId)?.base.node.locked
              )
            })
          : undefined
        if (!edge || !edge.route.ends || !capability) {
          return undefined
        }

        const editingThisSelectedEdge =
          edit?.kind === 'edge-label'
          && edit.edgeId === edgeId

        return {
          edgeId,
          ends: edge.route.ends,
          canReconnectSource: capability.reconnectSource,
          canReconnectTarget: capability.reconnectTarget,
          canEditRoute: capability.editRoute,
          showEditHandles:
            tool.type === 'select'
            && interaction.chrome
            && !interaction.editingEdge
            && !editingThisSelectedEdge,
          routePoints: edgeApi.routePoints({
            edgeId,
            edge: edge.base.edge,
            handles: edge.route.handles,
            activeRouteIndex
          })
        }
      }
    },
    selection,
    chrome,
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
      ofNodes: (nodeIds) => {
        const ids = [...new Set(nodeIds.flatMap((nodeId) => {
          const owner = runtime.state().indexes.ownerByNode.get(nodeId)
          if (owner?.kind === 'mindmap') {
            return [owner.id]
          }

          const nodeOwner = runtime.state().graph.nodes.get(nodeId)?.base.owner
          if (nodeOwner?.kind === 'mindmap') {
            return [nodeOwner.id]
          }

          const projectedNode = runtime.state().graph.nodes.get(nodeId)?.base.node as
            | (Record<string, unknown> & { mindmapId?: MindmapId })
            | undefined
          if (typeof projectedNode?.mindmapId === 'string') {
            return [projectedNode.mindmapId]
          }

          const committedNode = runtime.state().document.snapshot.nodes[nodeId] as
            | (Record<string, unknown> & { mindmapId?: MindmapId })
            | undefined

          return typeof committedNode?.mindmapId === 'string'
            ? [committedNode.mindmapId]
            : []
        }))]

        return ids.length === 1
          ? ids[0]
          : undefined
      },
      addChildTargets: ({
        mindmapId,
        selection,
        edit
      }) => {
        const structure = runtime.state().graph.owners.mindmaps.get(mindmapId)?.structure
        const selectedNodeId = selectionApi.members.singleNode(selection)
        if (
          !structure
          || !selectedNodeId
          || (
            selectedNodeId !== structure.rootId
            && structure.tree.nodes[selectedNodeId] === undefined
          )
        ) {
          return []
        }
        if (edit?.kind === 'node' && edit.nodeId === selectedNodeId) {
          return []
        }

        const node = runtime.state().graph.nodes.get(selectedNodeId)
        if (!node?.geometry.rect || node.base.node.locked) {
          return []
        }

        return mindmapApi.plan.addChildTargets({
          structure: {
            rootId: structure.rootId,
            nodeIds: structure.nodeIds,
            tree: structure.tree
          },
          nodeId: selectedNodeId,
          rect: node.geometry.rect
        })
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
    view,
    items: runtime.items
  }
}
