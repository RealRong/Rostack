import type { Operation } from '@whiteboard/core/types'
import type { CommandFailure } from '@engine-types/result'
import type { TranslateResult } from '@engine-types/internal/translate'
import { cancelled as cancelledResult, failure, invalid as invalidResult } from '../../result'

export function success(operations: readonly Operation[]): TranslateResult<void>
export function success<T>(operations: readonly Operation[], output: T): TranslateResult<T>
export function success<T>(operations: readonly Operation[], output?: T): TranslateResult<T> {
  return {
    ok: true,
    operations,
    output: output as T
  }
}

export const invalid = (message: string, details?: unknown): CommandFailure =>
  invalidResult(message, details)

export const cancelled = (message?: string, details?: unknown): CommandFailure =>
  cancelledResult(message, details)

type FailLike = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

type OpsLike<TData extends { operations: readonly Operation[] }> = {
  ok: true
  data: TData
}

const toOutput = <TData, TOutput>(
  data: TData,
  select?: (data: TData) => TOutput
) =>
  select ? select(data) : undefined as TOutput

export const fromOps = <
  TData extends { operations: readonly Operation[] },
  TOutput = void
>(
  result: OpsLike<TData> | FailLike,
  select?: (data: TData) => TOutput
): TranslateResult<TOutput> =>
  result.ok
    ? success(result.data.operations, toOutput(result.data, select))
    : failure(result.error.code, result.error.message, result.error.details)
