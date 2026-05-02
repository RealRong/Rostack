import type {
  NodeModel,
  NodeRole,
  NodeType
} from '@whiteboard/core/types'
import type {
  EditCapability,
  EditField
} from '@whiteboard/editor/schema/edit'
import type {
  ControlId,
  NodeMeta,
  NodeStyleFieldKey
} from '@whiteboard/editor/node/spec'

export type NodeStyleFieldKind = 'string' | 'number' | 'numberArray'

export type NodeTypeCapability = {
  role: NodeRole
  connect: boolean
  enter: boolean
  resize: boolean
  rotate: boolean
}

export type NodeTypeRead = {
  meta: (type: NodeType) => NodeMeta
  capability: (type: NodeType) => NodeTypeCapability
  edit: (type: NodeType, field: EditField) => EditCapability | undefined
}

export type NodeTypeSupport = NodeTypeRead & {
  support: (node: Pick<NodeModel, 'type' | 'owner'>) => NodeTypeCapability
  hasControl: (node: NodeModel, control: ControlId) => boolean
  supportsStyle: (
    node: NodeModel,
    field: NodeStyleFieldKey,
    kind: NodeStyleFieldKind
  ) => boolean
}
