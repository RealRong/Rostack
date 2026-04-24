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
import type { Revision } from '@shared/projection-runtime'
import type {
  GraphDelta,
  PublishDelta,
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
  MindmapView,
  NodeDraft,
  NodePreview,
  NodeUiView,
  NodeView
} from './editor'
import type { SpatialIndexState } from '../runtime/spatial/state'

export interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  indexes: IndexState
  spatial: SpatialIndexState
  ui: UiState
  items: readonly SceneItem[]
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
    publish: PublishDelta
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
  nodes: ReadonlyMap<NodeId, NodeUiView>
  edges: ReadonlyMap<EdgeId, EdgeUiView>
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
