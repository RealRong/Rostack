import type { ErrorInfo } from '@whiteboard/core/types'
import type { EngineWrite } from './types/engineWrite'
import type { CommandFailure, CommandResult } from './types/result'

export const failure = <C extends string>(
  code: C,
  message: string,
  details?: unknown
): CommandFailure<C> => ({
  ok: false,
  error: {
    code,
    message,
    details
  } satisfies ErrorInfo<C>
})

export const invalid = (message: string, details?: unknown): CommandFailure<'invalid'> =>
  failure('invalid', message, details)

export const cancelled = (
  message = 'Cancelled.',
  details?: unknown
): CommandFailure<'cancelled'> =>
  failure('cancelled', message, details)

export const success = <T>(
  write: EngineWrite,
  data: T
): CommandResult<T> => ({
  ok: true,
  data,
  write
})
