import type { Result } from '@whiteboard/core/types/result'

export function ok(): Result<void, never>
export function ok<T>(data: T): Result<T, never>
export function ok<T>(data?: T): Result<T, never> {
  return {
    ok: true,
    data: data as T
  }
}

export const err = <C extends string>(
  code: C,
  message: string,
  details?: unknown
): Result<never, C> => ({
  ok: false,
  error: {
    code,
    message,
    reason:
      details
      && typeof details === 'object'
      && 'reason' in details
      && typeof (details as { reason?: unknown }).reason === 'string'
        ? (details as { reason: import('@whiteboard/core/types/result').InternalReason }).reason
        : undefined,
    details
  }
})
