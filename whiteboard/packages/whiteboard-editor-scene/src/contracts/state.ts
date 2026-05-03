import type { MutableFamilyState } from '@shared/core'
import type {
  MindmapRenderConnector,
  MindmapLayout,
} from '@whiteboard/core/mindmap'
import type {
  Document as WhiteboardDocument,
  Edge,
  Node,
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type {
  EditorStateDocument as EditorSnapshot
} from '@whiteboard/editor/state/document'
import type {
  ChromeView,
  ChromeStateView,
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
  nodes: MutableFamilyState<string, NodeView>
  edges: MutableFamilyState<string, EdgeView>
  owners: {
    mindmaps: MutableFamilyState<string, MindmapView>
    groups: MutableFamilyState<string, GroupView>
  }
  state: {
    node: MutableFamilyState<string, NodeStateView>
    edge: MutableFamilyState<string, EdgeStateView>
    chrome: ChromeStateView
  }
}

export interface IndexState {
  ownerByNode: Map<string, OwnerRef | undefined>
  mindmapNodes: Map<string, readonly string[]>
  parentByNode: Map<string, string | undefined>
  childrenByNode: Map<string, readonly string[]>
  edgeNodesByEdge: Map<string, EdgeNodes>
  edgeIdsByNode: Map<string, Set<string>>
  groupItems: Map<string, readonly GroupItemRef[]>
  groupSignature: Map<string, string>
  groupIdsBySignature: Map<string, readonly string[]>
  groupByEdge: Map<string, string | undefined>
}

export interface UiState {
  chrome: ChromeView
  nodes: MutableFamilyState<string, NodeUiView>
  edges: MutableFamilyState<string, EdgeUiView>
}

export interface RenderState {
  node: MutableFamilyState<string, NodeRenderView>
  statics: {
    ids: readonly EdgeStaticId[]
    byId: Map<EdgeStaticId, EdgeStaticView>
    styleKeyByEdge: Map<string, string>
    edgeIdsByStyleKey: Map<string, readonly string[]>
    staticIdByEdge: Map<string, EdgeStaticId>
    staticIdsByStyleKey: Map<string, readonly EdgeStaticId[]>
  }
  labels: {
    ids: readonly EdgeLabelKey[]
    byId: Map<EdgeLabelKey, EdgeLabelView>
    keysByEdge: Map<string, readonly EdgeLabelKey[]>
  }
  masks: {
    ids: readonly string[]
    byId: Map<string, EdgeMaskView>
  }
  active: MutableFamilyState<string, EdgeActiveView>
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
  rootId: string
  nodeIds: readonly string[]
  structure: MindmapView['structure']['tree']
  tree: {
    layout?: MindmapLayout
    connectors: readonly MindmapRenderConnector[]
  }
}

export interface GraphGroupEntry {
  items: readonly GroupItemRef[]
}
