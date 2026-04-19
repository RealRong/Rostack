import type {
  BaseNodeDefinition,
  NodeType,
  NodeRole
} from '@whiteboard/core/types'
import type {
  EditCapability,
  EditField
} from '@whiteboard/editor/session/edit'
import type { NodeLayoutSpec } from '@whiteboard/editor/types/layout'

export type NodeHit = 'box' | 'path' | 'none'
export type NodeFamily = 'text' | 'shape' | 'frame' | 'draw'
export type ControlId = 'fill' | 'stroke' | 'text' | 'group'

export type NodeMeta = {
  key?: string
  name: string
  family: NodeFamily
  icon: string
  controls: readonly ControlId[]
}

export type NodeDefinition = BaseNodeDefinition & {
  meta: NodeMeta
  role?: NodeRole
  hit?: NodeHit
  connect?: boolean
  rotate?: boolean
  resize?: boolean
  layout?: NodeLayoutSpec
  enter?: boolean
  edit?: {
    fields?: Partial<Record<EditField, EditCapability>>
  }
}

export type NodeRegistry = {
  get: (type: NodeType) => NodeDefinition | undefined
}
