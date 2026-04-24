export { DEFAULT_BOARD_CONFIG } from './config/defaults'
export { normalizeDocument } from './document/normalize'
export { createEngine } from './runtime/engine'
export { DEFAULT_ENGINE_HISTORY_CONFIG } from './mutation'

import { createEngine as createEngineBase } from './runtime/engine'

export const engine = {
  create: createEngineBase
} as const

export type * from './contracts/core'
export type * from './contracts/document'
export type * from './contracts/intent'
export type * from './contracts/result'
