import type { MindmapNodeId, NodeId, Rect } from '@whiteboard/core/types'

export type MindmapLineView = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

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
  baseOffset: {
    x: number
    y: number
  }
  bbox: {
    width: number
    height: number
  }
  shiftX: number
  shiftY: number
  lines: readonly MindmapLineView[]
  nodes: readonly MindmapNodeView[]
  ghost?: {
    width: number
    height: number
    x: number
    y: number
  }
  connectionLine?: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
  insertLine?: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
  onAddChild: (
    nodeId: MindmapNodeId,
    placement: 'left' | 'right' | 'up' | 'down'
  ) => void
}
