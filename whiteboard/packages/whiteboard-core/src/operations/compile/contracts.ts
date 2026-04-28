import type {
  MutationCompileControl,
  MutationCompileHandler,
  MutationCompileHandlerInput,
  MutationCompileHandlerTable
} from '@shared/mutation'
import type {
  Document,
  Operation,
  ResultCode
} from '@whiteboard/core/types'
import type {
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intent-types'

export type WhiteboardCompileCode = ResultCode

export type WhiteboardCompileControls<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = MutationCompileHandlerInput<
  Document,
  WhiteboardIntent<K>,
  Operation,
  WhiteboardIntentOutput<K>,
  import('./scope').WhiteboardCompileServices,
  WhiteboardCompileCode
>

export type WhiteboardIntentHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = MutationCompileHandler<
  Document,
  WhiteboardIntent<K>,
  Operation,
  WhiteboardIntentOutput<K>,
  import('./scope').WhiteboardCompileServices,
  WhiteboardCompileCode
>

export type WhiteboardIntentHandlers = MutationCompileHandlerTable<
  WhiteboardMutationTable,
  Document,
  Operation,
  import('./scope').WhiteboardCompileServices,
  WhiteboardCompileCode
>

export type WhiteboardScopedIntentHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = (
  intent: WhiteboardIntent<K>,
  scope: import('./scope').WhiteboardCompileScope
) => WhiteboardIntentOutput<K> | MutationCompileControl<WhiteboardCompileCode> | void

export type WhiteboardScopedIntentHandlers = {
  [K in WhiteboardIntentKind]: WhiteboardScopedIntentHandler<K>
}
