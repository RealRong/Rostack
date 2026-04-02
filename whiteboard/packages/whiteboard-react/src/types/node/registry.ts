import type {
  Node,
  NodeUpdateInput,
  NodeSchema,
  NodeType,
  Rect
} from '@whiteboard/core/types'
import type { CSSProperties, ReactNode } from 'react'

export type NodeRole = 'content' | 'frame' | 'group'
export type NodeHit = 'box' | 'path'
export type NodeFamily = 'text' | 'shape' | 'container' | 'draw'
export type ControlId = 'fill' | 'stroke' | 'text' | 'group'

export type NodeMeta = {
  key?: string
  name: string
  family: NodeFamily
  icon: string
  controls: readonly ControlId[]
}

export type NodeWrite = {
  update: (update: NodeUpdateInput) => void
}

export type NodeRenderProps = {
  node: Node
  rect: Rect
  selected: boolean
  hovered: boolean
  write: NodeWrite
}

export type NodeDefinition = {
  type: NodeType
  meta: NodeMeta
  describe?: (node: Node) => NodeMeta
  role?: NodeRole
  hit?: NodeHit
  connect?: boolean
  schema?: NodeSchema
  defaultData?: Record<string, unknown>
  render: (props: NodeRenderProps) => ReactNode
  style?: (props: NodeRenderProps) => CSSProperties
  canRotate?: boolean
  canResize?: boolean
  autoMeasure?: boolean
  enter?: boolean
}

export type NodeRegistry = {
  get: (type: NodeType) => NodeDefinition | undefined
  register: (definition: NodeDefinition) => void
}
