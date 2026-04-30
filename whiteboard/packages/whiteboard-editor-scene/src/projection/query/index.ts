import { document as documentApi, type DocumentReader } from '@whiteboard/core/document'
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
  GraphCapture,
  RenderCapture,
  UiCapture
} from '../../contracts/capture'
import type {
  EdgeView,
  NodeCapabilityInput,
  NodeView,
  OwnerRef,
  Query,
  SceneQuery,
  SceneViewSnapshot
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { readGroupSignatureFromTarget } from '../../model/graph/group'
import {
  readMindmapStructure,
  readRelatedEdgeIds,
  readTreeDescendants
} from '../../model/index/read'
import { createSpatialRead } from '../../model/spatial/query'
import type { SpatialIndexState } from '../../model/spatial/state'
import { createBoundsRead } from './bounds'
import { createChromeRead } from './chrome'
import { createFrameRead } from './frame'
import { createHitRead } from './hit'
import { createSelectionRead } from './selection'
import { createViewRead } from './view'

export interface EditorSceneProjectionRead extends Query {
  capture: {
    documentRevision(): Revision
    graph(): GraphCapture
    render(): RenderCapture
    items(): WorkingState['items']
    ui(): UiCapture
  }
  source: DocumentReader
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

const createDocumentQuery = (input: {
  state: () => WorkingState
  source: DocumentReader
}): Query['document'] => ({
  snapshot: () => input.state().document.snapshot,
  background: () => input.state().document.background,
  node: input.source.nodes.get,
  edge: input.source.edges.get,
  group: input.source.groups.get,
  mindmap: input.source.mindmaps.get,
  nodeIds: input.source.nodes.ids,
  edgeIds: input.source.edges.ids,
  groupIds: input.source.groups.ids,
  mindmapIds: input.source.mindmaps.ids,
  canvas: {
    order: input.source.canvas.order,
    slot: input.source.canvas.slot,
    groupRefs: input.source.canvas.groupRefs
  },
  slice: ({ nodeIds, edgeIds }) => {
    const exported = documentApi.slice.export.selection({
      doc: input.state().document.snapshot,
      nodeIds,
      edgeIds
    })

    return exported.ok
      ? exported.data
      : undefined
  }
})

const createRuntimeQuery = (input: {
  state: () => WorkingState
}): Query['runtime'] => ({
  session: {
    tool: () => input.state().runtime.session.tool,
    selection: () => input.state().runtime.interaction.selection,
    hover: () => input.state().runtime.interaction.hover,
    edit: () => input.state().runtime.session.edit,
    interaction: () => input.state().runtime.interaction,
    preview: () => input.state().runtime.session.preview
  },
  facts: {
    touchedNodeIds: () => input.state().runtime.facts.touchedNodeIds,
    touchedEdgeIds: () => input.state().runtime.facts.touchedEdgeIds,
    touchedMindmapIds: () => input.state().runtime.facts.touchedMindmapIds,
    activeEdgeIds: () => input.state().runtime.facts.activeEdgeIds,
    uiChanged: () => input.state().runtime.facts.uiChanged,
    overlayChanged: () => input.state().runtime.facts.overlayChanged,
    chromeChanged: () => input.state().runtime.facts.chromeChanged
  }
})

export const createProjectionRead = (runtime: {
  revision: () => Revision
  state: () => WorkingState
  items: () => WorkingState['items']
  spatial: () => SpatialIndexState
  nodeCapability?: NodeCapabilityInput
  view: () => SceneViewSnapshot
}): EditorSceneProjectionRead => {
  const spatial = createSpatialRead({
    state: runtime.spatial
  })
  const source = documentApi.reader(() => runtime.state().document.snapshot)
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
  const viewport = createViewRead({
    state: runtime.state,
    view: runtime.view,
    hit,
    spatial
  })
  const overlay = createChromeRead({
    state: runtime.state,
    view: viewport
  })
  const bounds = createBoundsRead({
    state: runtime.state
  })
  const readMindmapStructureByValue = (
    value: MindmapId | NodeId | string
  ) => {
    const structure = readMindmapStructure({
      document: runtime.state().document.snapshot,
      indexes: runtime.state().indexes,
      value
    })
    return structure
      ? runtime.state().graph.owners.mindmaps.get(structure.id)?.structure
      : undefined
  }

  const sceneQuery: SceneQuery = {
    relatedEdgeIds: (nodeIds) => readRelatedEdgeIds(runtime.state().indexes, nodeIds),
    descendants: (nodeIds) => readTreeDescendants(runtime.state().indexes, nodeIds),
    mindmapStructure: readMindmapStructureByValue,
    ownerByNode: (nodeId) => runtime.state().indexes.ownerByNode.get(nodeId),
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
    bounds,
    node: {
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
    overlay,
    mindmap: {
      resolve: (value) => resolveMindmapId(runtime.state(), value),
      structure: (value) => {
        const mindmapId = resolveMindmapId(runtime.state(), value as string)
          ?? (runtime.state().graph.owners.mindmaps.has(value as MindmapId)
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
    frame,
    hit,
    viewport,
    items: runtime.items
  }

  return {
    revision: runtime.revision,
    source,
    capture: {
      documentRevision: () => runtime.state().revision.document,
      graph: () => ({
        nodes: runtime.state().graph.nodes,
        edges: runtime.state().graph.edges,
        owners: {
          mindmaps: runtime.state().graph.owners.mindmaps,
          groups: runtime.state().graph.owners.groups
        }
      }),
      render: () => ({
        edge: {
          statics: {
            ids: runtime.state().render.statics.ids,
            byId: runtime.state().render.statics.byId
          },
          active: runtime.state().render.active,
          labels: {
            ids: runtime.state().render.labels.ids,
            byId: runtime.state().render.labels.byId
          },
          masks: {
            ids: runtime.state().render.masks.ids,
            byId: runtime.state().render.masks.byId
          },
          overlay: runtime.state().render.overlay
        }
      }),
      items: () => runtime.state().items,
      ui: () => ({
        chrome: runtime.state().ui.chrome,
        nodes: runtime.state().ui.nodes,
        edges: runtime.state().ui.edges
      })
    },
    document: createDocumentQuery({
      state: runtime.state,
      source
    }),
    runtime: createRuntimeQuery({
      state: runtime.state
    }),
    scene: {
      node: (id) => runtime.state().graph.nodes.get(id),
      edge: (id) => runtime.state().graph.edges.get(id),
      mindmap: (id) => runtime.state().graph.owners.mindmaps.get(id),
      group: (id) => runtime.state().graph.owners.groups.get(id),
      nodes: () => runtime.state().graph.nodes.entries(),
      edges: () => runtime.state().graph.edges.entries(),
      mindmaps: () => runtime.state().graph.owners.mindmaps.entries(),
      groups: () => runtime.state().graph.owners.groups.entries(),
      query: sceneQuery
    }
  }
}
