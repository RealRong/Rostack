import type {
  NodeModel,
  NodeRole,
  NodeUpdateInput,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type {
  NodeDefinition as EditorNodeDefinition
} from '@whiteboard/editor'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor'
import type { CSSProperties, ReactNode } from 'react'

export type NodeMeta = EditorNodeDefinition['meta']
export type NodeFamily = NodeMeta['family']
export type ControlId = NodeMeta['controls'][number]
export type NodeHit = NonNullable<EditorNodeDefinition['hit']>

export type {
  NodeRole
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

export type NodeDefinition = EditorNodeDefinition & {
  render: (props: NodeRenderProps) => ReactNode
  style?: (props: NodeRenderProps) => CSSProperties
}

export type NodeRegistry = {
  get: (type: NodeType) => NodeDefinition | undefined
  register: (definition: NodeDefinition) => void
}
