import type {
  MutationResult
} from '@shared/mutation'
import type {
  Intent as CoreIntent,
} from '@dataview/core/types'
import type {
  ValidationCode
} from '@dataview/core/mutation'
import type {
  EngineApplyCommit
} from '@dataview/engine/contracts/write'

export type DataviewErrorCode =
  | ValidationCode
  | 'mutation_engine.compile.blocked'
  | 'mutation_engine.compile.empty'
  | 'mutation_engine.apply.empty'
  | 'mutation_engine.execute.empty'

export type Intent = CoreIntent
export type IntentKind = Intent['type']
export type IntentData = unknown
export type ExecuteInput = Intent | readonly Intent[]
export type ExecuteResult = MutationResult<unknown, EngineApplyCommit>
export type ExecuteResultOf<I extends ExecuteInput> = MutationResult<
  I extends readonly Intent[]
    ? readonly unknown[]
    : unknown,
  EngineApplyCommit
>

export type DispatchResult = MutationResult<
  unknown,
  EngineApplyCommit
>
