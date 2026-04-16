import type { Result } from '@whiteboard/core/types/result'
import type { MindmapInsertPayload } from '@whiteboard/core/types/mindmap'
import type {
  MindmapCommandOptions,
  NodeStyle,
  Rect,
  Size
} from '@whiteboard/core/types/model'
import type { NodeInput } from '@whiteboard/core/types/operations'

export type { MindmapInsertPayload } from '@whiteboard/core/types/mindmap'

export type MindmapId = string
export type MindmapNodeId = string
export type MindmapPresetKey = string
export type MindmapSeedKey = string

export type MindmapTopicData =
  | { kind: 'text'; text?: string }
  | { kind: 'file'; fileId: string; name?: string }
  | { kind: 'link'; url: string; title?: string }
  | { kind: 'ref'; ref: { type: 'whiteboard-node' | 'object'; id: string }; title?: string }
  | { kind: 'custom'; [key: string]: unknown }

export type MindmapNodeFrameKind =
  | 'ellipse'
  | 'rect'
  | 'underline'

export type MindmapNodeFrameStyle = {
  kind: MindmapNodeFrameKind
  color: string
  width: number
}

export type MindmapNodeStyle = {
  frame: MindmapNodeFrameStyle
  fill: string
  text: string
  paddingX: number
  paddingY: number
  minWidth?: number
}

export type MindmapBranchLineKind =
  | 'curve'
  | 'elbow'
  | 'rail'

export type MindmapStrokeStyle =
  | 'solid'
  | 'dashed'
  | 'dotted'

export type MindmapBranchStyle = {
  color: string
  line: MindmapBranchLineKind
  width: number
  stroke: MindmapStrokeStyle
}

export type MindmapTreeNodeStyle = {
  node: MindmapNodeStyle
  branch: MindmapBranchStyle
}

export interface MindmapTreeNode {
  parentId?: MindmapNodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  branch: MindmapBranchStyle
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

export type MindmapLayoutSpec = {
  side: 'left' | 'right' | 'both'
  mode: MindmapLayoutMode
  hGap: number
  vGap: number
}

export interface MindmapTree {
  rootNodeId: MindmapNodeId
  nodes: Record<MindmapNodeId, MindmapTreeNode>
  children: Record<MindmapNodeId, MindmapNodeId[]>
  layout: MindmapLayoutSpec
  meta?: {
    createdAt?: string
    updatedAt?: string
  }
}

export type GetNodeSize = (id: MindmapNodeId) => Size

export interface MindmapSizeAdapter {
  getNodeSize: GetNodeSize
  invalidate?: (id?: MindmapNodeId) => void
}

export type LayoutMindmap = (
  tree: MindmapTree,
  getNodeSize: GetNodeSize,
  options?: MindmapLayoutOptions
) => MindmapLayout

export interface MindmapIdGenerator {
  nodeId?: () => MindmapNodeId
}

export type MindmapCreateInput = {
  id?: MindmapId
  rootId?: MindmapNodeId
  preset?: MindmapPresetKey
  seed?: MindmapSeedKey
}

export type MindmapTreePatch = Partial<{
  layout: Partial<MindmapLayoutSpec>
}>

export type MindmapInsertInput =
  | {
      kind: 'child'
      parentId: MindmapNodeId
      payload?: MindmapTopicData | MindmapInsertPayload
      options?: MindmapCommandOptions
    }
  | {
      kind: 'sibling'
      nodeId: MindmapNodeId
      position: 'before' | 'after'
      payload?: MindmapTopicData | MindmapInsertPayload
      options?: Pick<MindmapCommandOptions, 'layout'>
    }
  | {
      kind: 'parent'
      nodeId: MindmapNodeId
      payload?: MindmapTopicData | MindmapInsertPayload
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

export type MindmapTemplateNode = {
  label: string
  node: Omit<NodeInput, 'id' | 'position'>
  style: MindmapNodeStyle
  branch: MindmapBranchStyle
  side?: 'left' | 'right'
}

export type MindmapTemplate = {
  layout: MindmapLayoutSpec
  root: MindmapTemplateNode
  children: readonly MindmapTemplateNode[]
}

export type MindmapPreviewModel = {
  tree: MindmapTree
  labels: Record<MindmapNodeId, string>
  nodeStyles: Record<MindmapNodeId, MindmapNodeStyle>
}

export type MindmapMaterializedCreate = {
  tree: MindmapTree
  nodeInputs: Record<MindmapNodeId, Omit<NodeInput, 'id' | 'position'>>
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

export const buildMindmapTextNodeStyle = (
  style: MindmapNodeStyle
): NodeStyle => ({
  fill: style.fill,
  color: style.text,
  stroke: style.frame.color,
  strokeWidth: style.frame.width,
  paddingX: style.paddingX,
  paddingY: style.paddingY,
  frameKind: style.frame.kind,
  minWidth: style.minWidth ?? 0
})
