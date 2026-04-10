import type {
  Node,
  NodeSchema,
  NodeType
} from '@whiteboard/core/types'
import type {
  EditCapability,
  EditField
} from '../../runtime/state/edit'

export type NodeHit = 'box' | 'path' | 'none'
export type NodeFamily = 'text' | 'shape' | 'frame' | 'draw'
export type ControlId = 'fill' | 'stroke' | 'text' | 'group'
export type NodeRole = 'content' | 'frame'

export type NodeMeta = {
  key?: string
  name: string
  family: NodeFamily
  icon: string
  controls: readonly ControlId[]
}

export type NodeDefinition = {
  type: NodeType
  meta: NodeMeta
  describe?: (node: Node) => NodeMeta
  role?: NodeRole
  geometry?: 'rect' | 'shape'
  hit?: NodeHit
  connect?: boolean
  schema?: NodeSchema
  defaultData?: Record<string, unknown>
  canRotate?: boolean
  canResize?: boolean
  autoMeasure?: boolean
  enter?: boolean
  edit?: {
    fields?: Partial<Record<EditField, EditCapability>>
  }
}

export type NodeRegistry = {
  get: (type: NodeType) => NodeDefinition | undefined
}
