import type {
  EditorBoundaryTaskRuntime
} from '@whiteboard/editor/boundary/task'
import type {
  EditorProcedure,
  EditorProcedureSignal,
  EditorPublished,
  EditorPublishRequest,
  EditorTaskRequest
} from '@whiteboard/editor/boundary/procedure'

export type {
  EditorPublished,
  EditorPublishRequest,
  EditorTaskRequest
}

export type EditorCommand<TResult = void> = EditorProcedure<TResult>

export type EditorCommandSignal = EditorProcedureSignal

export type EditorCommandHandler<TContext, TArgs extends unknown[], TResult> = (
  ctx: TContext,
  ...args: TArgs
) => EditorCommand<TResult>

export type EditorCommandTree<TContext, TValue> = {
  [TKey in keyof TValue]: TValue[TKey] extends (...args: infer TArgs) => infer TResult
    ? EditorCommandHandler<TContext, TArgs, TResult>
    : TValue[TKey] extends object
      ? EditorCommandTree<TContext, TValue[TKey]>
      : never
}

export type EditorCommandTaskRuntime = EditorBoundaryTaskRuntime

export interface EditorCommandRunner<TContext> {
  bind<TArgs extends unknown[], TResult>(
    handler: EditorCommandHandler<TContext, TArgs, TResult>
  ): (...args: TArgs) => TResult
  execute<TResult>(command: EditorCommand<TResult>): TResult
  dispose(): void
}
