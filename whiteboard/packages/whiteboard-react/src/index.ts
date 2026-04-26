import '@shared/ui/css/core.css'
import '@whiteboard/product/theme/whiteboard.css'
import './styles/whiteboard-react.css'

import {
  createDefaultNodeRegistry,
  createNodeRegistry
} from '@whiteboard/react/features/node'

export { Whiteboard } from '@whiteboard/react/Whiteboard'
export { useEditor } from '@whiteboard/react/runtime/hooks'
export { useWhiteboard } from '@whiteboard/react/runtime/hooks'

export const nodeRegistry = {
  create: createNodeRegistry,
  createDefault: createDefaultNodeRegistry
} as const

export type {
  WhiteboardOptions,
  WhiteboardProps
} from '@whiteboard/react/types/common/board'
export type {
  WhiteboardCollabOptions,
  WhiteboardCollabPresenceOptions
} from '@whiteboard/react/types/common/collab'
export type {
  WhiteboardPresenceActivity,
  WhiteboardPresenceBinding,
  WhiteboardPresencePointer,
  WhiteboardPresenceSelection,
  WhiteboardPresenceState,
  WhiteboardPresenceTool,
  WhiteboardPresenceUser
} from '@whiteboard/react/types/common/presence'
export type { WhiteboardInstance } from '@whiteboard/react/types/runtime'
export type { Tool } from '@whiteboard/editor'
export type {
  ControlId,
  NodeDefinition,
  NodeRegistry,
  NodeRenderProps,
  NodeWrite,
  NodeHit,
  NodeMeta,
  NodeFamily
} from '@whiteboard/react/types/node'
export type { NodeRole } from '@whiteboard/core/types'
