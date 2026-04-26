import type { EditorSceneBridge } from '@whiteboard/editor/projection/bridge'
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
  projection,
  tasks
}: {
  projection: Pick<EditorSceneBridge, 'current' | 'mark' | 'flush'>
  tasks: EditorBoundaryTaskRuntime
}): EditorBoundaryExecutor => {
  const readPublished = () => toEditorPublished(
    projection.current().snapshot
  )

  const execute = <TResult,>(
    procedure: EditorProcedure<TResult>
  ): TResult => {
    try {
      let step = procedure.next()

      while (!step.done) {
        const signal = step.value

        if (signal.kind === 'publish') {
          if (signal.delta) {
            projection.mark(signal.delta)
          }
          projection.flush()
          step = procedure.next(readPublished())
          continue
        }

        tasks.schedule(signal)
        step = procedure.next(readPublished())
      }

      return step.value
    } finally {
      projection.flush()
    }
  }

  return {
    atomic: (fn) => (
      ...args
    ) => {
      try {
        return fn(...args)
      } finally {
        projection.flush()
      }
    },
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
