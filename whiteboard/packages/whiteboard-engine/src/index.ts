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
export type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
export type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from '@whiteboard/engine/types/projection'
export type {
  Engine,
  EngineRuntimeOptions,
  BoardConfig,
  EngineRead
} from '@whiteboard/engine/types/instance'
