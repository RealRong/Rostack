import type {
  MindmapLayout,
  MindmapLayoutSpec,
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
  Rect,
  SpatialNode
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

export type MindmapItem = {
  id: NodeId
  node: SpatialNode
  tree: MindmapTree
  layout: MindmapLayoutSpec
  computed: MindmapLayout
  shiftX: number
  shiftY: number
  childNodeIds: readonly MindmapNodeId[]
  connectors: readonly MindmapRenderConnector[]
}

export type NodeItem = {
  node: Node
  rect: Rect
}
