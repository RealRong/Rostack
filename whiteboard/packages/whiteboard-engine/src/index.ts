export { DEFAULT_BOARD_CONFIG } from './config/defaults'
export type { BoardConfig } from './config'
export { normalizeDocument } from '@whiteboard/core/document'
export { createEngine } from './runtime/engine'

import { createEngine as createEngineBase } from './runtime/engine'

export const engine = {
  create: createEngineBase
} as const

export type * from './contracts/core'
export type * from './contracts/document'
export type * from './contracts/intent'
export type * from './contracts/result'
