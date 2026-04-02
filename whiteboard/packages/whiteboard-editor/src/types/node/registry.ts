import type { NodeRole } from '@whiteboard/core/node'
import type {
  Node,
  NodeSchema,
  NodeType
} from '@whiteboard/core/types'

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

export type NodeDefinition = {
  type: NodeType
  meta: NodeMeta
  describe?: (node: Node) => NodeMeta
  role?: NodeRole
  hit?: NodeHit
  connect?: boolean
  schema?: NodeSchema
  defaultData?: Record<string, unknown>
  canRotate?: boolean
  canResize?: boolean
  autoMeasure?: boolean
  enter?: boolean
}

export type NodeRegistry = {
  get: (type: NodeType) => NodeDefinition | undefined
  register: (definition: NodeDefinition) => void
}
