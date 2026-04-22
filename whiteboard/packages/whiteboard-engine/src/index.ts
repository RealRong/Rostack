export { DEFAULT_BOARD_CONFIG } from './config/defaults'
export { normalizeDocument } from './document/normalize'
export { createEngine } from './runtime/engine'

import { createEngine as createEngineBase } from './runtime/engine'

export const engine = {
  create: createEngineBase
} as const

export type * from './contracts/core'
export type * from './contracts/document'
export type * from './contracts/command'
export type * from './contracts/result'
