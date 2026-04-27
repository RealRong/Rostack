import type {
  NodeModel,
  NodeUpdateInput,
  Rect
} from '@whiteboard/core/types'
import type {
  ControlId,
  NodeBehaviorSpec as EditorNodeBehaviorSpec,
  NodeFamily,
  NodeHit,
  NodeMeta as EditorNodeMeta,
  NodeSpecEntry as EditorNodeSpecEntry
} from '@whiteboard/editor'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor'
import type { CSSProperties, ReactNode } from 'react'

export type NodeMeta = EditorNodeMeta

export type {
  ControlId,
  NodeFamily,
  NodeHit
}

export type NodeWrite = {
  patch: (update: NodeUpdateInput) => void
}

export type NodeRenderProps = {
  node: NodeModel
  rect: Rect
  rotation: number
  selected: boolean
  hovered: boolean
  edit?: {
    field: EditField
    caret: EditCaret
  }
  write: NodeWrite
}

export type NodeBehaviorSpec = EditorNodeBehaviorSpec & {
  render: (props: NodeRenderProps) => ReactNode
  style?: (props: NodeRenderProps) => CSSProperties
}

export type NodeSpecEntry = Omit<EditorNodeSpecEntry, 'behavior'> & {
  behavior: NodeBehaviorSpec
}

export type NodeSpec = Readonly<Record<string, NodeSpecEntry>>
