import type { Result } from '../types/result'
import type { MindmapInsertPayload } from '../types/mindmap'
import type {
  MindmapCommandOptions,
  Point,
  Rect,
  Size
} from '../types/model'

export type { MindmapInsertPayload } from '../types/mindmap'

export type MindmapId = string
export type MindmapNodeId = string

export type MindmapNodeData =
  | { kind: 'text'; text?: string }
  | { kind: 'file'; fileId: string; name?: string }
  | { kind: 'link'; url: string; title?: string }
  | { kind: 'ref'; ref: { type: 'whiteboard-node' | 'object'; id: string }; title?: string }
  | { kind: 'custom'; [key: string]: unknown }

export interface MindmapNode {
  id: MindmapNodeId
  parentId?: MindmapNodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  data?: MindmapNodeData | Record<string, unknown>
  style?: Record<string, string | number>
}

export interface MindmapTree {
  id: MindmapId
  rootId: MindmapNodeId
  nodes: Record<MindmapNodeId, MindmapNode>
  children: Record<MindmapNodeId, MindmapNodeId[]>
  meta?: {
    createdAt?: string
    updatedAt?: string
    position?: Point
  }
}

export interface MindmapLayout {
  node: Record<MindmapNodeId, Rect>
  bbox: Rect
}

export interface MindmapLayoutOptions {
  hGap?: number
  vGap?: number
  side?: 'left' | 'right' | 'both'
}

export type MindmapLayoutMode = 'simple' | 'tidy'

export type MindmapLayoutConfig = {
  mode?: MindmapLayoutMode
  options?: MindmapLayoutOptions
}

export type GetNodeSize = (id: MindmapNodeId) => Size

export interface MindmapSizeAdapter {
  getNodeSize: GetNodeSize
  invalidate?: (id?: MindmapNodeId) => void
}

export type LayoutMindmap = (tree: MindmapTree, getNodeSize: GetNodeSize, options?: MindmapLayoutOptions) => MindmapLayout

export interface MindmapIdGenerator {
  treeId?: () => MindmapId
  nodeId?: () => MindmapNodeId
}

export type MindmapDataMutation =
  | { op: 'set'; path?: string; value: unknown }
  | { op: 'unset'; path: string }
  | {
      op: 'splice'
      path: string
      index: number
      deleteCount: number
      values?: readonly unknown[]
    }

export type MindmapNodeUpdateInput = {
  records?: readonly MindmapDataMutation[]
  collapsed?: boolean
  side?: 'left' | 'right'
}

export type MindmapInsertInput =
  | {
      kind: 'child'
      parentId: MindmapNodeId
      payload?: MindmapNodeData | MindmapInsertPayload
      options?: MindmapCommandOptions
    }
  | {
      kind: 'sibling'
      nodeId: MindmapNodeId
      position: 'before' | 'after'
      payload?: MindmapNodeData | MindmapInsertPayload
      options?: Pick<MindmapCommandOptions, 'layout'>
    }
  | {
      kind: 'parent'
      nodeId: MindmapNodeId
      payload?: MindmapNodeData | MindmapInsertPayload
      options?: Pick<MindmapCommandOptions, 'side' | 'layout'>
    }

export type MindmapMoveSubtreeInput = {
  nodeId: MindmapNodeId
  parentId: MindmapNodeId
  index?: number
  side?: 'left' | 'right'
  layout?: MindmapCommandOptions['layout']
}

export type MindmapRemoveSubtreeInput = {
  nodeId: MindmapNodeId
}

export type MindmapCloneSubtreeInput = {
  nodeId: MindmapNodeId
  parentId?: MindmapNodeId
  index?: number
  side?: 'left' | 'right'
}

export type MindmapUpdateNodeInput = {
  nodeId: MindmapNodeId
  update: MindmapNodeUpdateInput
}

export type MindmapDragDropLine = {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type MindmapDragDropTarget = {
  type: 'attach' | 'reorder'
  parentId: MindmapNodeId
  index: number
  side?: 'left' | 'right'
  targetId?: MindmapNodeId
  connectionLine?: MindmapDragDropLine
  insertLine?: MindmapDragDropLine
}

export type MindmapCommandResult<T extends object = {}> = Result<{
  tree: MindmapTree
} & T, 'invalid'>
