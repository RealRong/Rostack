import type {
  ErrorInfo
} from '@whiteboard/core/types'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'

export type CommandFailure<C extends string = string> = {
  ok: false
  error: ErrorInfo<C>
}

export type CommandResult<T = void, C extends string = string> =
  | {
      ok: true
      data: T
      write: EngineWrite
    }
  | CommandFailure<C>
