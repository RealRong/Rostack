import type {
  MindmapDragDropTarget,
  MindmapLayoutConfig,
  MindmapLayoutOptions,
  MindmapNodeId,
  MindmapTree
} from '../mindmap/types'
import type { NodeId, Point, Rect } from './model'

export type MindmapConnectionLine = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export type MindmapInsertPayload = {
  kind: 'file' | 'text' | 'link' | 'ref' | 'custom'
  fileId?: string
  text?: string
  url?: string
  title?: string
  ref?: { type: 'whiteboard-node' | 'object'; id: string }
  [key: string]: unknown
}

export type MindmapInsertPlacement = 'left' | 'right' | 'up' | 'down'

export type MindmapInsertPlan =
  | {
      mode: 'child'
      parentId: MindmapNodeId
      index?: number
      side?: 'left' | 'right'
    }
  | {
      mode: 'sibling'
      nodeId: MindmapNodeId
      position: 'before' | 'after'
    }
  | {
      mode: 'towardRoot'
      nodeId: MindmapNodeId
    }

export type SubtreeDropTargetOptions = {
  tree: MindmapTree
  nodeRects: Map<MindmapNodeId, Rect>
  ghost: Rect
  dragNodeId: MindmapNodeId
  dragExcludeIds: Set<MindmapNodeId>
  layoutOptions?: MindmapLayoutOptions
  snapThreshold?: number
  defaultSide?: 'left' | 'right'
  reorderLineGap?: number
  reorderLineOverflow?: number
}

export type RootMindmapDrag = {
  kind: 'root'
  treeId: NodeId
  pointerId: number
  start: Point
  origin: Point
  position: Point
}

export type SubtreeMindmapDrag = {
  kind: 'subtree'
  treeId: NodeId
  pointerId: number
  nodeId: MindmapNodeId
  originParentId?: MindmapNodeId
  originIndex?: number
  baseOffset: Point
  offset: Point
  rect: Rect
  ghost: Rect
  excludeIds: MindmapNodeId[]
  layout: MindmapLayoutConfig
  drop?: MindmapDragDropTarget
}

export type MindmapDragState =
  | RootMindmapDrag
  | SubtreeMindmapDrag
