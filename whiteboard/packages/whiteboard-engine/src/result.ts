import type { EngineApplyCommit } from './types/engineWrite'
import type { IntentFailure, IntentResult } from './types/result'

export const failure = <C extends string>(
  code: C,
  message: string,
  details?: unknown
): IntentFailure<C> => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined
      ? {}
      : {
          details
        })
  }
})

export const invalid = (message: string, details?: unknown): IntentFailure<'invalid'> =>
  failure('invalid', message, details)

export const cancelled = (
  message = 'Cancelled.',
  details?: unknown
): IntentFailure<'cancelled'> =>
  failure('cancelled', message, details)

export const success = <T>(
  commit: EngineApplyCommit,
  data: T
): IntentResult<T> => ({
  ok: true,
  data,
  commit
})
