import type { EngineApplyCommit } from './engineWrite'

export type WhiteboardErrorCode = string

export type IntentError<C extends string = WhiteboardErrorCode> = {
  code: C
  message: string
  details?: unknown
}

export type IntentFailure<C extends string = WhiteboardErrorCode> = {
  ok: false
  error: IntentError<C>
}

export type IntentResult<
  T = void,
  C extends string = WhiteboardErrorCode
> =
  | {
      ok: true
      data: T
      commit: EngineApplyCommit
    }
  | IntentFailure<C>
