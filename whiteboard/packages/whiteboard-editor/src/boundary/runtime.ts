import type { EditorSceneSourceChange } from '@whiteboard/editor-scene'
import type { EditorBoundaryTaskRuntime } from './task'
import {
  toEditorPublished,
  type EditorProcedure
} from './procedure'

export interface EditorBoundaryRuntime {
  atomic<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult

  procedure<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => EditorProcedure<TResult>
  ): (...args: TArgs) => TResult

  dispose(): void
}

export interface EditorBoundaryExecutor extends EditorBoundaryRuntime {
  execute<TResult>(procedure: EditorProcedure<TResult>): TResult
}

export const createEditorBoundaryRuntime = ({
  scene,
  tasks
}: {
  scene: {
    current(): {
      revision: number
      state: Parameters<typeof toEditorPublished>[0]
    }
    publish(change: EditorSceneSourceChange): void
  }
  tasks: EditorBoundaryTaskRuntime
}): EditorBoundaryExecutor => {
  const readPublished = () => toEditorPublished(
    scene.current().state,
    scene.current().revision
  )

  const execute = <TResult,>(
    procedure: EditorProcedure<TResult>
  ): TResult => {
    try {
      let step = procedure.next()

      while (!step.done) {
        const signal = step.value

        if (signal.kind === 'publish') {
          if (signal.change) {
            scene.publish(signal.change)
          }
          step = procedure.next(readPublished())
          continue
        }

        tasks.schedule(signal)
        step = procedure.next(readPublished())
      }

      return step.value
    } finally {}
  }

  return {
    atomic: (fn) => (
      ...args
    ) => fn(...args),
    procedure: (fn) => (
      ...args
    ) => execute(
      fn(...args)
    ),
    execute,
    dispose: () => {
      tasks.dispose()
    }
  }
}
