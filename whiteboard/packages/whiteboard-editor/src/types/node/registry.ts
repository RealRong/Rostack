import type {
  BaseNodeDefinition,
  Node,
  NodeType,
  NodeRole
} from '@whiteboard/core/types'
import type { ShapeControlId } from '@whiteboard/core/node'
import type {
  EditCapability,
  EditField
} from '@whiteboard/editor/local/session/edit'
import type { NodeLayoutSpec } from '@whiteboard/editor/types/layout'

export type NodeHit = 'box' | 'path' | 'none'
export type NodeFamily = 'text' | 'shape' | 'frame' | 'draw'
export type ControlId = ShapeControlId | 'group'

export type NodeMeta = {
  key?: string
  name: string
  family: NodeFamily
  icon: string
  controls: readonly ControlId[]
}

export type NodeDefinition = BaseNodeDefinition & {
  meta: NodeMeta
  describe?: (node: Node) => NodeMeta
  role?: NodeRole
  hit?: NodeHit
  connect?: boolean
  canRotate?: boolean
  canResize?: boolean
  autoMeasure?: boolean
  layout?: NodeLayoutSpec
  enter?: boolean
  edit?: {
    fields?: Partial<Record<EditField, EditCapability>>
  }
}

export type NodeRegistry = {
  get: (type: NodeType) => NodeDefinition | undefined
}
