import type { Operation, Result } from '@whiteboard/core/types'

export type Step<T = void> = Result<{
  operations: Operation[]
  output: T
}, 'invalid' | 'cancelled'>
