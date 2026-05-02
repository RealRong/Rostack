import type {
  MutationCompileControl,
  MutationExecuteInput,
  MutationExecuteResult,
  MutationExecuteResultOfInput,
  MutationResult
} from '@shared/mutation'
import type {
  Intent as CoreIntent,
} from '@dataview/core/types'
import type {
  ValidationCode
} from '@dataview/core/mutation'
import type {
  compile
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

type DataviewCompileHandlers = typeof compile.handlers

type HandlerOutput<THandler> = Exclude<
  THandler extends (...args: any[]) => infer TResult
    ? TResult
    : never,
  void | MutationCompileControl<any>
>

type HandlerOfIntent<K extends CoreIntent['type']> = K extends keyof DataviewCompileHandlers
  ? DataviewCompileHandlers[K]
  : never

export type Intent = CoreIntent
export type IntentKind = Intent['type']
export type IntentData<K extends IntentKind = IntentKind> = HandlerOutput<HandlerOfIntent<K>>
export type ExecuteResult<K extends IntentKind = IntentKind> =
  MutationExecuteResult<IntentData<K>, EngineApplyCommit, DataviewErrorCode>
export type ExecuteInput = MutationExecuteInput<Intent>
export type ExecuteResultOf<I extends ExecuteInput> =
  MutationExecuteResultOfInput<
    DataviewCompileHandlers,
    Intent,
    EngineApplyCommit,
    I,
    DataviewErrorCode
  >

export type DispatchResult = MutationResult<
  unknown,
  EngineApplyCommit,
  DataviewErrorCode
>
