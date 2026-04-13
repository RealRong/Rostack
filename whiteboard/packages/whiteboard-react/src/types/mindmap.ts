import type {
  MindmapConnectionLine,
  MindmapLine,
  MindmapNodeId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'

export type MindmapLineView = MindmapConnectionLine

export type MindmapNodeView = {
  id: MindmapNodeId
  rect: Rect
  label: string
  dragActive: boolean
  attachTarget: boolean
  showActions: boolean
  dragPreviewActive: boolean
}

export type MindmapTreeViewData = {
  treeId: NodeId
  baseOffset: Point
  bbox: Rect
  shiftX: number
  shiftY: number
  lines: readonly MindmapLineView[]
  nodes: readonly MindmapNodeView[]
  ghost?: Rect
  connectionLine?: MindmapLine
  insertLine?: MindmapLine
  onAddChild: (
    nodeId: MindmapNodeId,
    placement: 'left' | 'right' | 'up' | 'down'
  ) => void
}
