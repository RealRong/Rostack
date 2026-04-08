export { createEngine } from './instance/engine'
export { normalizeDocument } from './document/normalize'
export {
  DEFAULT_BOARD_CONFIG
} from './config'

export type { EngineCommands } from './types/command'
export type { Commit } from './types/commit'
export type { CommandResult } from './types/result'
export type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from './types/projection'
export type {
  CreateEngineOptions,
  EngineInstance,
  ApplyOperationsOptions,
  BoardConfig,
  EngineRuntimeOptions,
  EngineRead,
  EngineReadIndex,
  GroupRead,
  SliceRead,
  MindmapRead
} from './types/instance'
