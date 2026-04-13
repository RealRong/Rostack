import type { Operation } from '@whiteboard/core/types'
import type { CommandFailure } from '#whiteboard-engine/types/result'

type TranslateSuccess<T = void> = {
  ok: true
  operations: readonly Operation[]
  output: T
}

export type TranslateResult<T = void> =
  | TranslateSuccess<T>
  | CommandFailure
