import type { ErrorInfo } from '@whiteboard/core/types'
import type { Commit } from '@engine-types/commit'
import type { CommandFailure, CommandResult } from '@engine-types/result'

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
  commit: Commit,
  data: T
): CommandResult<T> => ({
  ok: true,
  data,
  commit
})
