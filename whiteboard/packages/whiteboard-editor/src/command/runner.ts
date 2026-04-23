import type {
  EditorBoundaryExecutor
} from '@whiteboard/editor/boundary/runtime'
import type {
  EditorCommand,
  EditorCommandRunner
} from './contracts'

export const createEditorCommandRunner = <TContext,>({
  boundary,
  context
}: {
  boundary: Pick<EditorBoundaryExecutor, 'execute'>
  context: TContext
}): EditorCommandRunner<TContext> => {
  return {
    bind: (handler) => (
      ...args
    ) => boundary.execute(
      handler(context, ...args)
    ),
    execute: boundary.execute,
    dispose: () => {}
  }
}
