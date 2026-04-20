import { DEFAULT_BOARD_CONFIG } from '@whiteboard/engine/config'
import { normalizeDocument } from '@whiteboard/engine/document/normalize'
import { createEngine } from '@whiteboard/engine/instance/engine'

export const engine = {
  create: createEngine,
  document: {
    normalize: normalizeDocument
  },
  config: {
    default: DEFAULT_BOARD_CONFIG
  }
} as const

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
