import { store } from '@shared/core'
import {
  createProjectorStore,
  family,
  value,
  type InferProjectorStoreRead,
  type ProjectorStore
} from '@shared/projector'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, GroupId, MindmapId, Node, NodeId, Point, Rect } from '@whiteboard/core/types'
import type {
  Change,
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
  SceneItem,
  Snapshot
} from '@whiteboard/editor-scene'
import type { EditorSceneController } from '@whiteboard/editor/projection/controller'
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
  snapshot: store.ReadStore<Snapshot>
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

type ProjectionStoreRead = InferProjectorStoreRead<typeof projectionStoreSpec>

type SceneProjectionStore = {
  projection: ProjectorStore<Snapshot, Change, ProjectionStoreRead>
  stores: SceneProjectionStores
}

export type EditorSceneRuntime = {
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

const projectionStoreSpec = {
  fields: {
    snapshot: value<Snapshot, Change, Snapshot>({
      read: snapshot => snapshot,
      changed: () => true
    }),
    items: value<Snapshot, Change, readonly SceneItem[]>({
      read: snapshot => snapshot.items,
      changed: change => change.items.changed
    }),
    chrome: value<Snapshot, Change, ChromeView>({
      read: snapshot => snapshot.ui.chrome,
      changed: change => change.ui.chrome.changed
    }),
    nodeGraph: family<Snapshot, Change, NodeId, RuntimeNodeView>({
      read: snapshot => snapshot.graph.nodes,
      delta: change => change.graph.nodes
    }),
    edgeGraph: family<Snapshot, Change, EdgeId, RuntimeEdgeView>({
      read: snapshot => snapshot.graph.edges,
      delta: change => change.graph.edges
    }),
    edgeRenderStatics: family<Snapshot, Change, EdgeStaticId, EdgeStaticView>({
      read: snapshot => snapshot.render.edge.statics,
      delta: change => change.render.edge.statics
    }),
    edgeRenderActive: family<Snapshot, Change, EdgeId, EdgeActiveView>({
      read: snapshot => snapshot.render.edge.active,
      delta: change => change.render.edge.active
    }),
    edgeRenderLabels: family<Snapshot, Change, EdgeLabelKey, EdgeRenderLabelView>({
      read: snapshot => snapshot.render.edge.labels,
      delta: change => change.render.edge.labels
    }),
    edgeRenderMasks: family<Snapshot, Change, EdgeId, EdgeMaskView>({
      read: snapshot => snapshot.render.edge.masks,
      delta: change => change.render.edge.masks
    }),
    edgeRenderOverlay: value<Snapshot, Change, EdgeOverlayView>({
      read: snapshot => snapshot.render.edge.overlay,
      changed: change => change.render.edge.overlay.changed
    }),
    mindmap: family<Snapshot, Change, MindmapId, MindmapView>({
      read: snapshot => snapshot.graph.owners.mindmaps,
      delta: change => change.graph.owners.mindmaps
    }),
    group: family<Snapshot, Change, GroupId, GroupView>({
      read: snapshot => snapshot.graph.owners.groups,
      delta: change => change.graph.owners.groups
    }),
    nodeUi: family<Snapshot, Change, NodeId, NodeUiView>({
      read: snapshot => snapshot.ui.nodes,
      delta: change => change.ui.nodes
    }),
    edgeUi: family<Snapshot, Change, EdgeId, EdgeUiView>({
      read: snapshot => snapshot.ui.edges,
      delta: change => change.ui.edges
    })
  }
} as const

const createProjectionStore = (
  initial: Snapshot
): SceneProjectionStore => {
  const projection = createProjectorStore({
    initial,
    spec: projectionStoreSpec
  })

  return {
    projection,
    stores: {
      snapshot: projection.read.snapshot,
      items: projection.read.items,
      chrome: projection.read.chrome,
      nodeGraphIds: projection.read.nodeGraph.ids,
      nodeGraph: projection.read.nodeGraph.byId,
      edgeGraphIds: projection.read.edgeGraph.ids,
      edgeGraph: projection.read.edgeGraph.byId,
      edgeRenderStaticsIds: projection.read.edgeRenderStatics.ids,
      edgeRenderStatics: projection.read.edgeRenderStatics.byId,
      edgeRenderActiveIds: projection.read.edgeRenderActive.ids,
      edgeRenderActive: projection.read.edgeRenderActive.byId,
      edgeRenderLabelsIds: projection.read.edgeRenderLabels.ids,
      edgeRenderLabels: projection.read.edgeRenderLabels.byId,
      edgeRenderMasksIds: projection.read.edgeRenderMasks.ids,
      edgeRenderMasks: projection.read.edgeRenderMasks.byId,
      edgeRenderOverlay: projection.read.edgeRenderOverlay,
      mindmap: projection.read.mindmap.byId,
      group: projection.read.group.byId,
      nodeUi: projection.read.nodeUi.byId,
      edgeUi: projection.read.edgeUi.byId
    }
  }
}

const syncProjectionStore = (
  projection: SceneProjectionStore['projection'],
  result: {
    snapshot: Snapshot
    change: Change
  }
) => {
  projection.sync({
    previous: projection.snapshot(),
    next: result.snapshot,
    change: result.change
  })
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

export const createSceneSource = ({
  controller,
  state,
  nodeType,
  visibleRect,
  readZoom
}: {
  controller: Pick<EditorSceneController, 'query' | 'current' | 'subscribe'>
  state: EditorSessionState
  nodeType: NodeTypeSupport
  visibleRect: () => Rect
  readZoom: () => number
}): EditorSceneRuntime => {
  const published = createProjectionStore(controller.current().snapshot)
  controller.subscribe((result) => {
    syncProjectionStore(published.projection, result)
  })

  const sources = published.stores
  const query = controller.query
  const spatial = controller.query.spatial
  const readRevision = () => store.read(sources.snapshot).revision
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
      id: (value) => {
        store.read(sources.snapshot)
        return query.mindmapId(value)
      },
      structure: (value) => {
        store.read(sources.snapshot)
        return query.mindmapStructure(value as MindmapId | string)
      },
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
