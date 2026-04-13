export { createEngine } from './instance/engine'
export { normalizeDocument } from './document/normalize'
export {
  DEFAULT_BOARD_CONFIG
} from './config'

export type {
  EngineCommand,
  OrderMode,
  ExecuteOptions,
  ExecuteResult
} from './types/command'
export type { Commit } from './types/commit'
export type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from './types/projection'
export type {
  Engine,
  EngineHistory,
  ApplyOperationsOptions,
  BoardConfig,
  EngineRead
} from './types/instance'
