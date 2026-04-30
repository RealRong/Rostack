import { scheduler } from '@shared/core'

export class EditorTaskRuntimeDisposedError extends Error {
  constructor() {
    super('Editor task runtime has been disposed.')
    this.name = 'EditorTaskRuntimeDisposedError'
  }
}

export const isEditorTaskRuntimeDisposedError = (
  error: unknown
): error is EditorTaskRuntimeDisposedError => error instanceof EditorTaskRuntimeDisposedError

export interface EditorTaskRuntime {
  nextFrame(): Promise<void>
  delay(ms: number): Promise<void>
  dispose(): void
}

type PendingTask = {
  cancel: () => void
  reject: (error: Error) => void
}

export const createEditorTaskRuntime = (): EditorTaskRuntime => {
  let disposed = false
  const pending = new Set<PendingTask>()

  const failDisposed = () => new EditorTaskRuntimeDisposedError()

  const track = (task: PendingTask) => {
    pending.add(task)
  }

  const release = (task: PendingTask) => {
    pending.delete(task)
  }

  const createPendingPromise = (
    schedule: (finish: {
      resolve: () => void
      reject: (error: Error) => void
    }) => PendingTask
  ): Promise<void> => {
    if (disposed) {
      return Promise.reject(failDisposed())
    }

    return new Promise<void>((resolve, reject) => {
      let task: PendingTask | undefined
      task = schedule({
        resolve: () => {
          if (task) {
            release(task)
          }
          resolve()
        },
        reject: (error) => {
          if (task) {
            release(task)
          }
          reject(error)
        }
      })

      track(task)
    })
  }

  return {
    nextFrame: () => createPendingPromise((finish) => {
      const frame = scheduler.createFrameTask(() => {
        finish.resolve()
      })

      frame.schedule()

      return {
        cancel: () => {
          frame.cancel()
        },
        reject: finish.reject
      }
    }),
    delay: (ms) => {
      if (disposed) {
        return Promise.reject(failDisposed())
      }
      if (ms <= 0) {
        return Promise.resolve()
      }

      return createPendingPromise((finish) => {
        const timeout = scheduler.createTimeoutTask(() => {
          finish.resolve()
        })

        timeout.schedule(ms)

        return {
          cancel: () => {
            timeout.cancel()
          },
          reject: finish.reject
        }
      })
    },
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      const error = failDisposed()
      pending.forEach((task) => {
        task.cancel()
        task.reject(error)
      })
      pending.clear()
    }
  }
}
