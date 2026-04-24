import type { Path } from '@shared/mutation'
import type {
  NodeModel,
  NodeRole,
  NodeType
} from '@whiteboard/core/types'
import type {
  ControlId,
  NodeMeta
} from '@whiteboard/editor/types/node/registry'

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
}

export type NodeTypeSupport = NodeTypeRead & {
  hasControl: (node: NodeModel, control: ControlId) => boolean
  supportsStyle: (
    node: NodeModel,
    path: Path,
    kind: NodeStyleFieldKind
  ) => boolean
}
