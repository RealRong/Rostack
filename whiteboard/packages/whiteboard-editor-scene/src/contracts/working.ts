import type {
  MindmapRenderConnector,
  MindmapLayout,
} from '@whiteboard/core/mindmap'
import type {
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projector/phase'
import type {
  GraphDelta,
  SpatialDelta
} from './delta'
import type {
  ChromeView,
  EdgeNodes,
  EdgeDraft,
  EdgePreview,
  EdgeUiView,
  EdgeView,
  GroupView,
  GroupItemRef,
  OwnerRef,
  SceneItem,
  TextMeasure,
  MindmapView,
  NodeDraft,
  NodePreview,
  NodeUiView,
  NodeView
} from './editor'
import type {
  EdgeActiveView,
  EdgeLabelKey,
  EdgeLabelView,
  EdgeMaskView,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from './render'
import type { SpatialIndexState } from '../domain/spatial/state'

export interface WorkingState {
  measure?: TextMeasure
  revision: {
    document: Revision
  }
  graph: GraphState
  indexes: IndexState
  spatial: SpatialIndexState
  ui: UiState
  render: RenderState
  items: readonly SceneItem[]
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
  }
}

export interface GraphState {
  nodes: Map<NodeId, NodeView>
  edges: Map<EdgeId, EdgeView>
  owners: {
    mindmaps: Map<MindmapId, MindmapView>
    groups: Map<GroupId, GroupView>
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
  nodes: Map<NodeId, NodeUiView>
  edges: Map<EdgeId, EdgeUiView>
}

export interface RenderState {
  statics: {
    styleKeyByEdge: Map<EdgeId, string>
    edgeIdsByStyleKey: Map<string, readonly EdgeId[]>
    staticIdByEdge: Map<EdgeId, EdgeStaticId>
    staticIdsByStyleKey: Map<string, readonly EdgeStaticId[]>
    statics: Map<EdgeStaticId, EdgeStaticView>
  }
  labels: Map<EdgeLabelKey, EdgeLabelView>
  masks: Map<EdgeId, EdgeMaskView>
  active: Map<EdgeId, EdgeActiveView>
  overlay: EdgeOverlayView
}

export interface GraphNodeEntry {
  base: {
    node: Node
    owner?: OwnerRef
  }
  draft?: NodeDraft
  preview?: NodePreview
}

export interface GraphEdgeEntry {
  base: {
    edge: Edge
    nodes: EdgeNodes
  }
  draft?: EdgeDraft
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
