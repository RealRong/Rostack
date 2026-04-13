import '@shared/ui/css/core.css'
import './styles/whiteboard-react.css'

export { Whiteboard } from './Whiteboard'
export { useEditor } from './runtime/hooks'
export { useWhiteboard } from './runtime/hooks'
export { createNodeRegistry, createDefaultNodeRegistry } from './features/node'

export type {
  WhiteboardOptions,
  HistoryOptions,
  WhiteboardProps
} from './types/common/board'
export type {
  WhiteboardCollabOptions,
  WhiteboardCollabPresenceOptions
} from './types/common/collab'
export type {
  WhiteboardPresenceActivity,
  WhiteboardPresenceBinding,
  WhiteboardPresencePointer,
  WhiteboardPresenceSelection,
  WhiteboardPresenceState,
  WhiteboardPresenceTool,
  WhiteboardPresenceUser
} from './types/common/presence'
export type { WhiteboardInstance } from './types/runtime'
export type { Tool } from '@whiteboard/editor'
export type {
  ControlId,
  NodeDefinition,
  NodeRegistry,
  NodeRenderProps,
  NodeWrite,
  NodeRole,
  NodeHit,
  NodeMeta,
  NodeFamily
} from './types/node'
