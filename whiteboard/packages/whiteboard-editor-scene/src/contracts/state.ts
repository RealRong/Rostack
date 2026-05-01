import type { MutableFamilyState } from '@shared/core'
import type {
  MindmapRenderConnector,
  MindmapLayout,
} from '@whiteboard/core/mindmap'
import type {
  Document as WhiteboardDocument,
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type {
  ChromeView,
  ChromeStateView,
  EditorSnapshot,
  EdgeNodes,
  EdgeStateView,
  EdgePreview,
  EdgeUiView,
  EdgeView,
  GroupItemRef,
  GroupView,
  MindmapView,
  NodePreview,
  NodeStateView,
  NodeUiView,
  NodeView,
  OwnerRef,
  SceneItem
} from './editor'
import type { SceneItemKey } from './delta'
import type {
  EdgeActiveView,
  ChromeRenderView,
  EdgeLabelKey,
  EdgeLabelView,
  EdgeMaskView,
  NodeRenderView,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from './render'
import type { SpatialIndexState } from '../model/spatial/state'

export interface State {
  revision: {
    document: Revision
  }
  document: DocumentState
  runtime: RuntimeState
  graph: GraphState
  indexes: IndexState
  spatial: SpatialIndexState
  ui: UiState
  render: RenderState
  items: SceneItemsState
}

export interface RuntimeState {
  editor: {
    snapshot: EditorSnapshot
    interaction: import('./editor').InteractionInput
    view: import('./editor').SceneViewSnapshot
    facts: import('./editor').SceneRuntimeFacts
  }
}

export interface SceneItemsState {
  ids: readonly SceneItemKey[]
  byId: ReadonlyMap<SceneItemKey, SceneItem>
}

export interface DocumentState {
  snapshot: WhiteboardDocument
  background?: WhiteboardDocument['background']
}

export interface GraphState {
  nodes: MutableFamilyState<NodeId, NodeView>
  edges: MutableFamilyState<EdgeId, EdgeView>
  owners: {
    mindmaps: MutableFamilyState<MindmapId, MindmapView>
    groups: MutableFamilyState<GroupId, GroupView>
  }
  state: {
    node: MutableFamilyState<NodeId, NodeStateView>
    edge: MutableFamilyState<EdgeId, EdgeStateView>
    chrome: ChromeStateView
  }
}

export interface IndexState {
  ownerByNode: Map<NodeId, OwnerRef | undefined>
  mindmapNodes: Map<MindmapId, readonly NodeId[]>
  parentByNode: Map<NodeId, NodeId | undefined>
  childrenByNode: Map<NodeId, readonly NodeId[]>
  edgeNodesByEdge: Map<EdgeId, EdgeNodes>
  edgeIdsByNode: Map<NodeId, Set<EdgeId>>
  groupItems: Map<GroupId, readonly GroupItemRef[]>
  groupSignature: Map<GroupId, string>
  groupIdsBySignature: Map<string, readonly GroupId[]>
  groupByEdge: Map<EdgeId, GroupId | undefined>
}

export interface UiState {
  chrome: ChromeView
  nodes: MutableFamilyState<NodeId, NodeUiView>
  edges: MutableFamilyState<EdgeId, EdgeUiView>
}

export interface RenderState {
  node: MutableFamilyState<NodeId, NodeRenderView>
  statics: {
    ids: readonly EdgeStaticId[]
    byId: Map<EdgeStaticId, EdgeStaticView>
    styleKeyByEdge: Map<EdgeId, string>
    edgeIdsByStyleKey: Map<string, readonly EdgeId[]>
    staticIdByEdge: Map<EdgeId, EdgeStaticId>
    staticIdsByStyleKey: Map<string, readonly EdgeStaticId[]>
  }
  labels: {
    ids: readonly EdgeLabelKey[]
    byId: Map<EdgeLabelKey, EdgeLabelView>
    keysByEdge: Map<EdgeId, readonly EdgeLabelKey[]>
  }
  masks: {
    ids: readonly EdgeId[]
    byId: Map<EdgeId, EdgeMaskView>
  }
  active: MutableFamilyState<EdgeId, EdgeActiveView>
  overlay: EdgeOverlayView
  chrome: ChromeRenderView
}

export interface GraphNodeEntry {
  base: {
    node: Node
    owner?: OwnerRef
  }
  preview?: NodePreview
}

export interface GraphEdgeEntry {
  base: {
    edge: Edge
    nodes: EdgeNodes
  }
  preview?: EdgePreview
}

export interface GraphMindmapEntry {
  base: MindmapView['base']
  rootId: NodeId
  nodeIds: readonly NodeId[]
  structure: MindmapView['structure']['tree']
  tree: {
    layout?: MindmapLayout
    connectors: readonly MindmapRenderConnector[]
  }
}

export interface GraphGroupEntry {
  items: readonly GroupItemRef[]
}
