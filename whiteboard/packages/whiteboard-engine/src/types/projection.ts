import type {
  MindmapLayout,
  MindmapLayoutSpec,
  MindmapMemberRecord,
  MindmapNodeId,
  MindmapTree
} from '@whiteboard/core/mindmap'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap/render'
import type { ResolvedEdgeEnds } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  NodeGeometry,
  Node,
  NodeId,
  Rect
} from '@whiteboard/core/types'

export type CanvasNode = {
  node: Node
  geometry: NodeGeometry
}

export type EdgeItem = {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}

export type MindmapStructureItem = {
  id: NodeId
  rootId: MindmapNodeId
  nodeIds: readonly MindmapNodeId[]
  tree: MindmapTree
  topics: Readonly<Record<MindmapNodeId, MindmapMemberRecord>>
  layout: MindmapLayoutSpec
}

export type MindmapLayoutItem = {
  id: NodeId
  rootId: MindmapNodeId
  nodeIds: readonly MindmapNodeId[]
  computed: MindmapLayout
  connectors: readonly MindmapRenderConnector[]
}

export type MindmapSceneItem = {
  id: NodeId
  rootId: MindmapNodeId
  nodeIds: readonly MindmapNodeId[]
  bbox: Rect
  connectors: readonly MindmapRenderConnector[]
}

export type NodeItem = {
  node: Node
  rect: Rect
}
