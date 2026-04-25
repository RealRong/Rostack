import { store } from '@shared/core'
import {
  composeSync,
  createIdDeltaFamilySync,
  createValueSync
} from '@shared/projector/sync'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, GroupId, MindmapId, Node, NodeId, Point, Rect } from '@whiteboard/core/types'
import type {
  Change,
  ChromeView,
  EdgeUiView,
  EdgeView as RuntimeEdgeView,
  GroupView,
  MindmapView,
  NodeUiView,
  NodeView as RuntimeNodeView,
  Read as EditorGraphQuery,
  Result,
  SceneItem,
  Snapshot
} from '@whiteboard/editor-scene'
import type { EditorSceneController } from '@whiteboard/editor/projection/controller'
import type { HoverStore } from '@whiteboard/editor/input/hover/store'
import type { EdgeGuide } from '@whiteboard/editor/session/preview/types'
import {
  createEdgeRenderRuntime
} from '@whiteboard/editor/scene/edgeRender'
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
  mindmap: store.KeyedReadStore<MindmapId, MindmapView | undefined>
  group: store.KeyedReadStore<GroupId, GroupView | undefined>
  nodeUi: store.KeyedReadStore<NodeId, NodeUiView | undefined>
  edgeUi: store.KeyedReadStore<EdgeId, EdgeUiView | undefined>
}

type SceneProjectionBinding = {
  stores: SceneProjectionStores
  sync(result: Result): void
}

type SceneProjectionSink = {
  snapshot: store.ValueStore<Snapshot>
  items: store.ValueStore<readonly SceneItem[]>
  chrome: store.ValueStore<ChromeView>
  nodeGraph: store.FamilyStore<NodeId, RuntimeNodeView>
  edgeGraph: store.FamilyStore<EdgeId, RuntimeEdgeView>
  mindmap: store.FamilyStore<MindmapId, MindmapView>
  group: store.FamilyStore<GroupId, GroupView>
  nodeUi: store.FamilyStore<NodeId, NodeUiView>
  edgeUi: store.FamilyStore<EdgeId, EdgeUiView>
}

export type EditorSceneRuntime = {
  revision: () => number
  items: store.ReadStore<readonly SceneItem[]>
  query: {
    rect: EditorGraphQuery['spatial']['rect']
    visible: (
      options?: Parameters<EditorGraphQuery['spatial']['rect']>[1]
    ) => ReturnType<EditorGraphQuery['spatial']['rect']>
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
    render: ReturnType<typeof createEdgeRenderRuntime>['render']
    hit: {
      pick: (input: {
        point: Point
        threshold?: number
        excludeIds?: readonly EdgeId[]
      }) => EdgeId | undefined
    }
    interaction: ReturnType<typeof createEdgeRenderRuntime>['interaction']
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

const createFamilyRead = <Key, Value>(
  family: store.FamilyStore<Key, Value>
): store.KeyedReadStore<Key, Value | undefined> => store.createKeyedReadStore({
  get: key => family.read.get(key),
  subscribe: (key, listener) => family.byId.subscribe.key(key, listener),
  isEqual: (left, right) => left === right
})

const projectionSync = composeSync<
  Snapshot,
  Change,
  SceneProjectionSink
>(
  createValueSync({
    hasChanged: () => true,
    read: snapshot => snapshot,
    write: (value, sink) => {
      sink.snapshot.set(value)
    }
  }),
  createValueSync({
    hasChanged: change => change.items.changed,
    read: snapshot => snapshot.items,
    write: (value, sink) => {
      sink.items.set(value)
    }
  }),
  createValueSync({
    hasChanged: change => change.ui.chrome.changed,
    read: snapshot => snapshot.ui.chrome,
    write: (value, sink) => {
      sink.chrome.set(value)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.nodes,
    read: snapshot => snapshot.graph.nodes,
    apply: (patch, sink) => {
      sink.nodeGraph.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.edges,
    read: snapshot => snapshot.graph.edges,
    apply: (patch, sink) => {
      sink.edgeGraph.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.owners.mindmaps,
    read: snapshot => snapshot.graph.owners.mindmaps,
    apply: (patch, sink) => {
      sink.mindmap.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.graph.owners.groups,
    read: snapshot => snapshot.graph.owners.groups,
    apply: (patch, sink) => {
      sink.group.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.ui.nodes,
    read: snapshot => snapshot.ui.nodes,
    apply: (patch, sink) => {
      sink.nodeUi.write.apply(patch)
    }
  }),
  createIdDeltaFamilySync({
    delta: change => change.ui.edges,
    read: snapshot => snapshot.ui.edges,
    apply: (patch, sink) => {
      sink.edgeUi.write.apply(patch)
    }
  })
)

const createProjectionBinding = (
  initial: Snapshot
): SceneProjectionBinding => {
  const snapshot = store.createValueStore(initial)
  const items = store.createValueStore(initial.items)
  const chrome = store.createValueStore(initial.ui.chrome)
  const nodeGraphFamily = store.createFamilyStore({
    initial: initial.graph.nodes
  })
  const edgeGraphFamily = store.createFamilyStore({
    initial: initial.graph.edges
  })
  const mindmapFamily = store.createFamilyStore({
    initial: initial.graph.owners.mindmaps
  })
  const groupFamily = store.createFamilyStore({
    initial: initial.graph.owners.groups
  })
  const nodeUiFamily = store.createFamilyStore({
    initial: initial.ui.nodes
  })
  const edgeUiFamily = store.createFamilyStore({
    initial: initial.ui.edges
  })

  const sink: SceneProjectionSink = {
    snapshot,
    items,
    chrome,
    nodeGraph: nodeGraphFamily,
    edgeGraph: edgeGraphFamily,
    mindmap: mindmapFamily,
    group: groupFamily,
    nodeUi: nodeUiFamily,
    edgeUi: edgeUiFamily
  }

  return {
    stores: {
      snapshot,
      items,
      chrome,
      nodeGraphIds: nodeGraphFamily.ids as store.ReadStore<readonly NodeId[]>,
      nodeGraph: createFamilyRead(nodeGraphFamily),
      edgeGraphIds: edgeGraphFamily.ids as store.ReadStore<readonly EdgeId[]>,
      edgeGraph: createFamilyRead(edgeGraphFamily),
      mindmap: createFamilyRead(mindmapFamily),
      group: createFamilyRead(groupFamily),
      nodeUi: createFamilyRead(nodeUiFamily),
      edgeUi: createFamilyRead(edgeUiFamily)
    },
    sync: (result) => {
      const previous = snapshot.get()

      store.batch(() => {
        projectionSync.sync({
          previous,
          next: result.snapshot,
          change: result.change,
          sink
        })
      })
    }
  }
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
  hover,
  edgeGuide,
  nodeType,
  visibleRect,
  readZoom
}: {
  controller: Pick<EditorSceneController, 'query' | 'current' | 'subscribe'>
  state: EditorSessionState
  hover: Pick<HoverStore, 'get' | 'subscribe'>
  edgeGuide: store.ReadStore<EdgeGuide>
  nodeType: NodeTypeSupport
  visibleRect: () => Rect
  readZoom: () => number
}): EditorSceneRuntime => {
  const published = createProjectionBinding(controller.current().snapshot)
  controller.subscribe((result) => {
    published.sync(result)
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
    visible
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
  const edgeRender = createEdgeRenderRuntime({
    edge: {
      ids: edge.ids,
      view: edge.view,
      detail: edge.detail,
      model: edge.model,
      capability: edge.capability
    },
    selection: state.selection,
    edit: state.edit,
    tool: state.tool,
    interaction: state.interaction,
    hover,
    edgeGuide
  })
  const edgeHit: EditorSceneRuntime['edge']['hit'] = {
    pick: ({
      point,
      threshold,
      excludeIds
    }) => {
      const result = pick.resolve({
        point,
        radius: threshold ?? (8 / Math.max(readZoom(), 0.0001)),
        kinds: ['edge']
      })
      if (result.target?.kind !== 'edge') {
        return undefined
      }
      if (excludeIds?.includes(result.target.id)) {
        return undefined
      }
      return result.target.id
    }
  }
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
      render: edgeRender.render,
      hit: edgeHit,
      interaction: edgeRender.interaction
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
