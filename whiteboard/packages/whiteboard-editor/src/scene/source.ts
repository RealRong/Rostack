import { store } from '@shared/core'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, GroupId, MindmapId, Node, NodeId, Point, Rect } from '@whiteboard/core/types'
import type {
  ChromeView,
  EdgeActiveView,
  EdgeLabelKey,
  EdgeRenderLabelView,
  EdgeMaskView,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView,
  EdgeUiView,
  EdgeView as RuntimeEdgeView,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView as RuntimeNodeView,
  Read as EditorGraphQuery,
  RuntimeStores,
  SceneItem
} from '@whiteboard/editor-scene'
import type { EditorSceneBridge } from '@whiteboard/editor/projection/bridge'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorSessionState } from '@whiteboard/editor/types/editor'
import {
  createGraphEdgeRead,
  type GraphEdgeRead
} from './edge'
import {
  createSceneGeometry
} from './cache/geometry'
import {
  createSceneOrder
} from './cache/order'
import {
  createSceneScope
} from './cache/scope'
import {
  createSceneVisible
} from './cache/visible'
import { readMindmapNavigateTarget } from './mindmap'
import {
  createScenePick
} from './pick'
import {
  createGraphNodeRead,
  type GraphNodeGeometry,
  type GraphNodeRead
} from './node'
import {
  createGraphSelectionRead,
  type GraphSelectionRead
} from './selection'

type SceneProjectionStores = {
  items: store.ReadStore<readonly SceneItem[]>
  chrome: store.ReadStore<ChromeView>
  nodeGraphIds: store.ReadStore<readonly NodeId[]>
  nodeGraph: store.KeyedReadStore<NodeId, RuntimeNodeView | undefined>
  edgeGraphIds: store.ReadStore<readonly EdgeId[]>
  edgeGraph: store.KeyedReadStore<EdgeId, RuntimeEdgeView | undefined>
  edgeRenderStaticsIds: store.ReadStore<readonly EdgeStaticId[]>
  edgeRenderStatics: store.KeyedReadStore<EdgeStaticId, EdgeStaticView | undefined>
  edgeRenderActiveIds: store.ReadStore<readonly EdgeId[]>
  edgeRenderActive: store.KeyedReadStore<EdgeId, EdgeActiveView | undefined>
  edgeRenderLabelsIds: store.ReadStore<readonly EdgeLabelKey[]>
  edgeRenderLabels: store.KeyedReadStore<EdgeLabelKey, EdgeRenderLabelView | undefined>
  edgeRenderMasksIds: store.ReadStore<readonly EdgeId[]>
  edgeRenderMasks: store.KeyedReadStore<EdgeId, EdgeMaskView | undefined>
  edgeRenderOverlay: store.ReadStore<EdgeOverlayView>
  mindmap: store.KeyedReadStore<MindmapId, MindmapView | undefined>
  group: store.KeyedReadStore<GroupId, GroupView | undefined>
  nodeUi: store.KeyedReadStore<NodeId, NodeUiView | undefined>
  edgeUi: store.KeyedReadStore<EdgeId, EdgeUiView | undefined>
}

export type EditorSceneRuntime = {
  dispose: () => void
  revision: () => number
  items: store.ReadStore<readonly SceneItem[]>
  query: {
    rect: EditorGraphQuery['spatial']['rect']
    visible: (
      options?: Parameters<EditorGraphQuery['spatial']['rect']>[1]
    ) => ReturnType<EditorGraphQuery['spatial']['rect']>
    hit: {
      edge: (input: {
        point: Point
        threshold?: number
        excludeIds?: readonly EdgeId[]
      }) => EdgeId | undefined
    }
  }
  pick: ReturnType<typeof createScenePick>
  snap: {
    rect: EditorGraphQuery['snap']
  }
  geometry: {
    node: (nodeId: NodeId) => GraphNodeGeometry & {
      node: NonNullable<ReturnType<GraphNodeRead['get']>>['node']
    } | undefined
    edge: GraphEdgeRead['geometry']['get']
    order: (item: {
      kind: 'node' | 'edge' | 'mindmap'
      id: string
    }) => number
  }
  scope: {
    move: (target: SelectionTarget) => {
      nodes: readonly Node[]
      edges: ReturnType<GraphEdgeRead['edges']>
    }
    relatedEdges: (nodeIds: readonly NodeId[]) => readonly EdgeId[]
    bounds: (target: SelectionTarget) => Rect | undefined
  }
  frame: EditorGraphQuery['frame']
  node: {
    get: GraphNodeRead['get']
    read: GraphNodeRead['view']
    ids: GraphNodeRead['ids']
    all: GraphNodeRead['all']
    nodes: GraphNodeRead['nodes']
    capability: GraphNodeRead['capability']
    idsInRect: GraphNodeRead['idsInRect']
  }
  edge: {
    get: GraphEdgeRead['get']
    read: GraphEdgeRead['view']
    detail: GraphEdgeRead['detail']
    model: GraphEdgeRead['model']
    ids: GraphEdgeRead['ids']
    all: GraphEdgeRead['all']
    edges: GraphEdgeRead['edges']
    geometry: GraphEdgeRead['geometry']
    label: GraphEdgeRead['label']
    capability: GraphEdgeRead['capability']
    capabilityOf: (edgeId: EdgeId) => ReturnType<GraphEdgeRead['capability']> | undefined
    bounds: GraphEdgeRead['bounds']
    related: GraphEdgeRead['related']
    idsInRect: GraphEdgeRead['idsInRect']
    connectCandidates: GraphEdgeRead['connectCandidates']
    render: {
      statics: {
        ids: SceneProjectionStores['edgeRenderStaticsIds']
        byId: SceneProjectionStores['edgeRenderStatics']
      }
      active: {
        ids: SceneProjectionStores['edgeRenderActiveIds']
        byId: SceneProjectionStores['edgeRenderActive']
      }
      labels: {
        ids: SceneProjectionStores['edgeRenderLabelsIds']
        byId: SceneProjectionStores['edgeRenderLabels']
      }
      masks: {
        ids: SceneProjectionStores['edgeRenderMasksIds']
        byId: SceneProjectionStores['edgeRenderMasks']
      }
      overlay: SceneProjectionStores['edgeRenderOverlay']
    }
  }
  nodes: {
    get: GraphNodeRead['get']
    getMany: (nodeIds: readonly NodeId[]) => readonly NonNullable<ReturnType<GraphNodeRead['get']>>[]
    ids: GraphNodeRead['ids']
    read: GraphNodeRead['view']
    capability: store.KeyedReadStore<NodeId, ReturnType<GraphNodeRead['capability']> | undefined>
    idsInRect: GraphNodeRead['idsInRect']
  }
  edges: {
    get: GraphEdgeRead['get']
    getMany: (edgeIds: readonly EdgeId[]) => readonly NonNullable<ReturnType<GraphEdgeRead['get']>>[]
    ids: GraphEdgeRead['ids']
    read: GraphEdgeRead['view']
    geometry: GraphEdgeRead['geometry']
    detail: GraphEdgeRead['detail']
    model: GraphEdgeRead['model']
    capability: (edgeId: EdgeId) => ReturnType<GraphEdgeRead['capability']> | undefined
    label: GraphEdgeRead['label']
    idsInRect: GraphEdgeRead['idsInRect']
    connectCandidates: GraphEdgeRead['connectCandidates']
  }
  selection: GraphSelectionRead
  mindmap: {
    view: SceneProjectionStores['mindmap']
    id: (value: string) => MindmapId | undefined
    structure: (
      value: MindmapId | string
    ) => ReturnType<EditorGraphQuery['mindmapStructure']>
    navigate: (input: {
      id: MindmapId
      fromNodeId: NodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }) => NodeId | undefined
  }
  group: {
    ofNode: (nodeId: string) => GroupId | undefined
    ofEdge: (edgeId: string) => GroupId | undefined
    target: (groupId: GroupId) => SelectionTarget | undefined
    exact: (target: SelectionTarget) => readonly GroupId[]
  }
  chrome: SceneProjectionStores['chrome']
}

const toGroupTarget = (
  items: GroupView['structure']['items']
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: items.flatMap((item) => (
    item.kind === 'node'
      ? [item.id]
      : []
  )),
  edgeIds: items.flatMap((item) => (
    item.kind === 'edge'
      ? [item.id]
      : []
  ))
})

const collectPresentValues = <TId extends string, TValue>(
  ids: readonly TId[],
  readValue: (id: TId) => TValue | undefined
): readonly TValue[] => ids.flatMap((id) => {
  const value = readValue(id)
  return value ? [value] : []
})

const createSceneProjectionStores = (
  stores: RuntimeStores
): SceneProjectionStores => ({
  items: stores.items,
  chrome: stores.ui.chrome,
  nodeGraphIds: stores.graph.nodes.ids,
  nodeGraph: stores.graph.nodes.byId,
  edgeGraphIds: stores.graph.edges.ids,
  edgeGraph: stores.graph.edges.byId,
  edgeRenderStaticsIds: stores.render.edge.statics.ids,
  edgeRenderStatics: stores.render.edge.statics.byId,
  edgeRenderActiveIds: stores.render.edge.active.ids,
  edgeRenderActive: stores.render.edge.active.byId,
  edgeRenderLabelsIds: stores.render.edge.labels.ids,
  edgeRenderLabels: stores.render.edge.labels.byId,
  edgeRenderMasksIds: stores.render.edge.masks.ids,
  edgeRenderMasks: stores.render.edge.masks.byId,
  edgeRenderOverlay: stores.render.edge.overlay,
  mindmap: stores.graph.owners.mindmaps.byId,
  group: stores.graph.owners.groups.byId,
  nodeUi: stores.ui.nodes.byId,
  edgeUi: stores.ui.edges.byId
})

export const createSceneSource = ({
  controller,
  state,
  nodeType,
  visibleRect,
  readZoom
}: {
  controller: Pick<EditorSceneBridge, 'read' | 'current' | 'stores'>
  state: EditorSessionState
  nodeType: NodeTypeSupport
  visibleRect: () => Rect
  readZoom: () => number
}): EditorSceneRuntime => {
  const sources = createSceneProjectionStores(controller.stores)
  const query = controller.read
  const spatial = controller.read.spatial
  const readRevision = () => controller.current().revision
  const geometry = createSceneGeometry({
    revision: readRevision,
    nodeGraph: sources.nodeGraph,
    edgeGraph: sources.edgeGraph
  })

  const node = createGraphNodeRead({
    sources,
    spatial,
    type: nodeType,
    geometry: geometry.node
  })
  const edge = createGraphEdgeRead({
    sources,
    spatial,
    relatedEdges: query.relatedEdges,
    node,
    geometry: geometry.edge
  })
  const selectionSource = createGraphSelectionRead({
    source: state.selection,
    node,
    edge
  })
  const order = createSceneOrder({
    items: sources.items
  })
  const nodeCapability = store.createKeyedDerivedStore<NodeId, ReturnType<GraphNodeRead['capability']> | undefined>({
    get: (nodeId) => {
      const current = store.read(node.view, nodeId)
      return current
        ? node.capability(current.node)
        : undefined
    }
  })
  const edgeDetail: EditorSceneRuntime['edge']['detail'] = edge.detail
  const edgeCapability = (edgeId: EdgeId) => {
    const current = store.read(edge.detail, edgeId)
    return current
      ? edge.capability(current.edge)
      : undefined
  }
  const visible = createSceneVisible({
    revision: readRevision,
    visibleRect,
    rect: spatial.rect
  })

  const queryApi: EditorSceneRuntime['query'] = {
    rect: spatial.rect,
    visible,
    hit: {
      edge: ({
        point,
        threshold,
        excludeIds
      }) => query.hit.edge({
        point,
        threshold: threshold ?? (8 / Math.max(readZoom(), 0.0001)),
        excludeIds
      })
    }
  }
  const pick = createScenePick({
    readZoom,
    spatial: {
      candidates: spatial.candidates
    },
    node: {
      view: node.view,
      geometry: node.geometry
    },
    edge: {
      geometry: edge.geometry
    },
    mindmap: sources.mindmap
  })
  const scope = createSceneScope({
    spatialRect: spatial.rect,
    relatedEdges: query.relatedEdges,
    nodeView: node.view,
    edgeBounds: edge.bounds,
    readEdges: edge.edges
  })

  return {
    dispose: () => {
      pick.runtime.dispose()
    },
    revision: readRevision,
    items: sources.items,
    query: queryApi,
    pick,
    snap: {
      rect: query.snap
    },
    geometry: {
      node: node.geometry,
      edge: (edgeId) => store.read(edge.geometry, edgeId),
      order: order.get
    },
    scope,
    frame: query.frame,
    node: {
      get: node.get,
      read: node.view,
      ids: node.ids,
      all: node.all,
      nodes: node.nodes,
      capability: node.capability,
      idsInRect: node.idsInRect
    },
    edge: {
      get: edge.get,
      read: edge.view,
      detail: edgeDetail,
      model: edge.model,
      ids: edge.ids,
      all: edge.all,
      edges: edge.edges,
      geometry: edge.geometry,
      label: edge.label,
      capability: edge.capability,
      capabilityOf: edgeCapability,
      bounds: edge.bounds,
      related: edge.related,
      idsInRect: edge.idsInRect,
      connectCandidates: edge.connectCandidates,
      render: {
        statics: {
          ids: sources.edgeRenderStaticsIds,
          byId: sources.edgeRenderStatics
        },
        active: {
          ids: sources.edgeRenderActiveIds,
          byId: sources.edgeRenderActive
        },
        labels: {
          ids: sources.edgeRenderLabelsIds,
          byId: sources.edgeRenderLabels
        },
        masks: {
          ids: sources.edgeRenderMasksIds,
          byId: sources.edgeRenderMasks
        },
        overlay: sources.edgeRenderOverlay
      }
    },
    nodes: {
      get: node.get,
      getMany: (nodeIds) => collectPresentValues(nodeIds, (nodeId) => store.read(node.view, nodeId)),
      ids: node.ids,
      read: node.view,
      capability: nodeCapability,
      idsInRect: node.idsInRect
    },
    edges: {
      get: edge.get,
      getMany: (edgeIds) => collectPresentValues(edgeIds, (edgeId) => store.read(edge.view, edgeId)),
      ids: edge.ids,
      read: edge.view,
      geometry: edge.geometry,
      detail: edge.detail,
      model: edge.model,
      capability: edgeCapability,
      label: edge.label,
      idsInRect: edge.idsInRect,
      connectCandidates: edge.connectCandidates
    },
    selection: selectionSource,
    mindmap: {
      view: sources.mindmap,
      id: (value) => query.mindmapId(value),
      structure: (value) => query.mindmapStructure(value as MindmapId | string),
      navigate: (input) => {
        const structure = query.mindmapStructure(input.id)
        return structure
          ? readMindmapNavigateTarget({
              structure,
              fromNodeId: input.fromNodeId,
              direction: input.direction
            })
          : undefined
      }
    },
    group: {
      ofNode: (nodeId) => store.read(node.view, nodeId)?.node.groupId,
      ofEdge: (edgeId) => store.read(edge.view, edgeId)?.edge.groupId,
      target: (groupId) => {
        const group = store.read(sources.group, groupId)
        return group
          ? toGroupTarget(group.structure.items)
          : undefined
      },
      exact: query.groupExact
    },
    chrome: sources.chrome
  }
}
