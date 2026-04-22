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
  EdgeDraft,
  EdgePreview,
  EdgeView,
  GroupView,
  MindmapView,
  NodeDraft,
  NodePreview,
  NodeView,
  SceneSnapshot,
  UiSnapshot
} from './editor'

export interface WorkingState {
  revision: {
    document: Revision
  }
  graph: GraphState
  ui: UiSnapshot
  scene: SceneSnapshot
}

export interface GraphState {
  nodes: ReadonlyMap<NodeId, NodeView>
  edges: ReadonlyMap<EdgeId, EdgeView>
  owners: {
    mindmaps: ReadonlyMap<MindmapId, MindmapView>
    groups: ReadonlyMap<GroupId, GroupView>
  }
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
