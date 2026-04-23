import type { Snapshot } from '@whiteboard/editor-graph'
import type { ProjectionController } from '@whiteboard/editor/projection/controller'
import type {
  EditorCommand,
  EditorCommandRunner,
  EditorCommandTaskRuntime,
  EditorPublished
} from './contracts'

const toPublished = (
  snapshot: Snapshot
): EditorPublished => ({
  revision: snapshot.revision,
  graph: snapshot.graph,
  scene: snapshot.scene,
  ui: snapshot.ui
})

export const createEditorCommandRunner = <TContext,>({
  controller,
  context,
  tasks
}: {
  controller: Pick<ProjectionController, 'current' | 'mark' | 'flush'>
  context: TContext
  tasks: EditorCommandTaskRuntime
}): EditorCommandRunner<TContext> => {
  const readPublished = () => toPublished(
    controller.current().snapshot
  )

  const execute = <TResult,>(
    command: EditorCommand<TResult>
  ): TResult => {
    let step = command.next()

    while (!step.done) {
      const signal = step.value

      if (signal.kind === 'publish') {
        if (signal.delta) {
          controller.mark(signal.delta)
        }
        controller.flush()
        step = command.next(readPublished())
        continue
      }

      tasks.schedule(signal)
      step = command.next(readPublished())
    }

    controller.flush()
    return step.value
  }

  return {
    bind: (handler) => (
      ...args
    ) => execute(
      handler(context, ...args)
    ),
    execute,
    dispose: () => {
      tasks.dispose()
    }
  }
}
