import type {
  NodeRole,
  SchemaFieldOption,
  SchemaFieldType
} from '@whiteboard/core/types'
import type {
  EditCapability,
  EditField
} from '@whiteboard/editor/session/edit'
import type { NodeLayoutSpec } from '@whiteboard/editor/types/layout'

export type NodeHit = 'box' | 'path' | 'none'
export type NodeFamily = 'text' | 'shape' | 'frame' | 'draw'
export type ControlId = 'fill' | 'stroke' | 'text' | 'group'
export type NodeFieldScope = 'data' | 'style' | 'label'
export type NodeFieldKey = `${NodeFieldScope}.${string}`
export type NodeStyleFieldKey = `style.${string}`
export type NodeFieldValueKind = 'string' | 'number' | 'numberArray'

export type NodeMeta = {
  type: string
  name: string
  family: NodeFamily
  icon: string
  controls: readonly ControlId[]
}

export type NodeFieldSpec = {
  label: string
  type: SchemaFieldType
  kind?: NodeFieldValueKind
  defaultValue?: unknown
  required?: boolean
  options?: readonly SchemaFieldOption[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
  description?: string
  readonly?: boolean
}

export type NodeSchemaSpec = {
  fields: Readonly<Record<NodeFieldKey, NodeFieldSpec>>
}

export type NodeBehaviorSpec = {
  role?: NodeRole
  geometry?: 'rect' | 'shape'
  defaultData?: Record<string, unknown>
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

export type NodeSpecEntry = {
  meta: NodeMeta
  schema?: NodeSchemaSpec
  behavior: NodeBehaviorSpec
}

export type NodeSpec = Readonly<Record<string, NodeSpecEntry>>

export type NodeSpecReader = {
  get: (type: string) => NodeSpecEntry | undefined
}
