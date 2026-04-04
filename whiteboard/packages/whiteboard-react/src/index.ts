import './styles/whiteboard-react.css'

export { Whiteboard } from './Whiteboard'
export { useEditor } from './runtime/hooks/useEditor'
export { useWhiteboard } from './runtime/hooks/useWhiteboard'
export { createNodeRegistry, createDefaultNodeRegistry } from './features/node/registry'

export type {
  WhiteboardOptions,
  HistoryOptions,
  WhiteboardProps
} from './types/common/board'
export type { WhiteboardCollabOptions } from './types/common/collab'
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
