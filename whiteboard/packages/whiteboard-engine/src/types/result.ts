import type {
  ErrorInfo
} from '@whiteboard/core/types'
import type { Commit } from './commit'

export type CommandFailure<C extends string = string> = {
  ok: false
  error: ErrorInfo<C>
}

export type CommandResult<T = void, C extends string = string> =
  | {
      ok: true
      data: T
      commit: Commit
    }
  | CommandFailure<C>
