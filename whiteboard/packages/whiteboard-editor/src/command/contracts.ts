import type {
  GraphSnapshot,
  InputDelta,
  SceneSnapshot,
  UiSnapshot
} from '@whiteboard/editor-graph'

export interface EditorPublished {
  revision: number
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}

export type EditorCommand<TResult = void> = Generator<
  EditorCommandSignal,
  TResult,
  EditorPublished
>

export type EditorPublishRequest = {
  kind: 'publish'
  delta?: InputDelta
}

export type EditorTaskRequest =
  | {
      kind: 'task'
      lane: 'microtask'
      command: EditorCommand<void>
    }
  | {
      kind: 'task'
      lane: 'frame'
      command: EditorCommand<void>
    }
  | {
      kind: 'task'
      lane: 'delay'
      delayMs: number
      command: EditorCommand<void>
    }

export type EditorCommandSignal =
  | EditorPublishRequest
  | EditorTaskRequest

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

export interface EditorCommandTaskRuntime {
  schedule(request: EditorTaskRequest): void
  dispose(): void
}

export interface EditorCommandRunner<TContext> {
  bind<TArgs extends unknown[], TResult>(
    handler: EditorCommandHandler<TContext, TArgs, TResult>
  ): (...args: TArgs) => TResult
  execute<TResult>(command: EditorCommand<TResult>): TResult
  dispose(): void
}
