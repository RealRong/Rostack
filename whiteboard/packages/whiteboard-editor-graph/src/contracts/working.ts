import type {
  MindmapRenderConnector,
  MindmapLayout,
} from '@whiteboard/core/mindmap'
import type {
  CanvasItemRef,
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type { Revision } from '@shared/projection-runtime'
import type {
  GraphDelta,
  SpatialDelta
} from './delta'
import type {
  ChromeView,
  EdgeDraft,
  EdgePreview,
  EdgeUiView,
  EdgeView,
  GroupView,
  MindmapView,
  NodeDraft,
  NodePreview,
  NodeUiView,
  NodeView,
  SceneSnapshot,
  SelectionView
} from './editor'
import type { SpatialIndexState } from '../runtime/spatial/state'

export interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  spatial: SpatialIndexState
  ui: UiState
  scene: SceneSnapshot
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

export interface UiState {
  selection: SelectionView
  chrome: ChromeView
  nodes: ReadonlyMap<NodeId, NodeUiView>
  edges: ReadonlyMap<EdgeId, EdgeUiView>
}

export interface GraphNodeEntry {
  base: {
    node: Node
    owner?: document.OwnerRef
  }
  draft?: NodeDraft
  preview?: NodePreview
}

export interface GraphEdgeEntry {
  base: {
    edge: Edge
    nodes: document.EdgeNodes
  }
  draft?: EdgeDraft
  preview?: EdgePreview
}

export interface GraphMindmapEntry {
  base: MindmapView['base']
  nodeIds: readonly NodeId[]
  tree: {
    layout?: MindmapLayout
    connectors: readonly MindmapRenderConnector[]
  }
}

export interface GraphGroupEntry {
  items: readonly GroupItemRef[]
}

export type GroupItemRef = CanvasItemRef
