import type { EdgeInput, SpatialNodeInput } from '@whiteboard/core/types/operations'
import type {
  MindmapBranchStyle,
  MindmapLayoutSpec
} from '@whiteboard/core/mindmap/types'

export type EdgeTemplate = Pick<
  EdgeInput,
  'type' | 'style' | 'textMode'
>

export type NodeTemplate = Omit<
  SpatialNodeInput,
  'id' | 'position'
>

export type MindmapTemplateNode = {
  node: NodeTemplate
  side?: 'left' | 'right'
  branch?: MindmapBranchStyle
  children?: readonly MindmapTemplateNode[]
}

export type MindmapTemplate = {
  layout: MindmapLayoutSpec
  root: MindmapTemplateNode
}
