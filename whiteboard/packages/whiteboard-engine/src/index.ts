export { createEngine } from '@whiteboard/engine/instance/engine'
export { normalizeDocument } from '@whiteboard/engine/document/normalize'
export {
  DEFAULT_BOARD_CONFIG
} from '@whiteboard/engine/config'

export type {
  Command,
  EngineCommand,
  OrderMode,
  BatchApplyOptions,
  ExecuteOptions,
  ExecuteResult
} from '@whiteboard/engine/types/command'
export type { Commit } from '@whiteboard/engine/types/commit'
export type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from '@whiteboard/engine/types/projection'
export type {
  Engine,
  EngineHistory,
  BoardConfig,
  EngineRead
} from '@whiteboard/engine/types/instance'
