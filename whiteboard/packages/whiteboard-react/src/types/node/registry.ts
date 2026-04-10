import type {
  Node,
  NodeUpdateInput,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type {
  ControlId,
  NodeDefinition as EditorNodeDefinition,
  NodeFamily,
  NodeHit,
  NodeMeta,
  NodeRole
} from '@whiteboard/editor'
import type { CSSProperties, ReactNode } from 'react'

export type {
  ControlId,
  NodeFamily,
  NodeHit,
  NodeMeta,
  NodeRole
}

export type NodeWrite = {
  patch: (update: NodeUpdateInput) => void
}

export type NodeRenderProps = {
  node: Node
  rect: Rect
  selected: boolean
  hovered: boolean
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
