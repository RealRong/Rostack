import type {
  MutationError,
  MutationFailure,
  MutationResult
} from '@shared/mutation/engine'
import type { EngineApplyCommit } from './engineWrite'

export type WhiteboardErrorCode = string

export type IntentError<C extends string = WhiteboardErrorCode> =
  MutationError<C>

export type IntentFailure<C extends string = WhiteboardErrorCode> =
  MutationFailure<C>

export type IntentResult<
  T = void,
  C extends string = WhiteboardErrorCode
> = MutationResult<T, EngineApplyCommit, C>
