import { edge as edgeApi } from '@whiteboard/core/edge'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  EdgeId,
  MindmapId,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type {
  NodeCapabilityInput,
  Query,
  SceneViewSnapshot
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { createDocumentResolver } from '../../model/document/resolver'
import { readGroupSignatureFromTarget } from '../../model/graph/group'
import { readRelatedEdgeIds } from '../../model/index/read'
import { createSpatialRead } from '../../model/spatial/query'
import type { SpatialIndexState } from '../../model/spatial/state'
import { createBoundsRead } from './bounds'
import { createChromeRead } from './chrome'
import { createFrameRead } from './frame'
import { createHitRead } from './hit'
import { createSelectionRead } from './selection'
import { createViewRead } from './view'

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

export const createQuery = (runtime: {
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
    snap: (rect: Rect) => nodeApi.snap.buildCandidates(
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
