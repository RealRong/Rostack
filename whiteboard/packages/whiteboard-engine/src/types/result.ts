import type {
  MutationError,
  MutationFailure,
  MutationResult
} from '@shared/mutation'
import type { EngineWrite } from './engineWrite'

export type WhiteboardErrorCode = string

export type IntentError<C extends string = WhiteboardErrorCode> =
  MutationError<C>

export type IntentFailure<C extends string = WhiteboardErrorCode> =
  MutationFailure<C>

export type IntentResult<
  T = void,
  C extends string = WhiteboardErrorCode
> = MutationResult<T, EngineWrite, C>
