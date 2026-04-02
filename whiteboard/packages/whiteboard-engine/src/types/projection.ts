import type {
  MindmapConnectionLine,
  MindmapLayout,
  MindmapLayoutConfig,
  MindmapNodeId,
  MindmapTree
} from '@whiteboard/core/mindmap'
import type { ResolvedEdgeEnds } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Node,
  NodeId,
  Rect,
  SpatialNode
} from '@whiteboard/core/types'

export type CanvasNode = {
  node: Node
  rect: Rect
  aabb: Rect
  rotation: number
}

export type EdgeItem = {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}

export type MindmapItem = {
  id: NodeId
  node: SpatialNode
  tree: MindmapTree
  layout: MindmapLayoutConfig
  computed: MindmapLayout
  shiftX: number
  shiftY: number
  lines: MindmapConnectionLine[]
  labels: Record<MindmapNodeId, string>
}

export type NodeItem = {
  node: Node
  rect: Rect
}
