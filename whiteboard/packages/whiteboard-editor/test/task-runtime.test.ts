import { describe, expect, it, vi } from 'vitest'
import {
  createEditorTaskRuntime,
  EditorTaskRuntimeDisposedError
} from '../src/tasks/runtime'

describe('editor task runtime', () => {
  it('resolves nextFrame on the next scheduled frame', async () => {
    vi.useFakeTimers()
    const tasks = createEditorTaskRuntime()

    try {
      const promise = tasks.nextFrame()
      await vi.advanceTimersByTimeAsync(16)
      await expect(promise).resolves.toBeUndefined()
    } finally {
      tasks.dispose()
      vi.useRealTimers()
    }
  })

  it('resolves delay after the requested timeout', async () => {
    vi.useFakeTimers()
    const tasks = createEditorTaskRuntime()

    try {
      const promise = tasks.delay(40)
      await vi.advanceTimersByTimeAsync(39)
      let settled = false
      void promise.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await expect(promise).resolves.toBeUndefined()
    } finally {
      tasks.dispose()
      vi.useRealTimers()
    }
  })

  it('rejects pending tasks when disposed', async () => {
    vi.useFakeTimers()
    const tasks = createEditorTaskRuntime()

    try {
      const promise = tasks.nextFrame()
      tasks.dispose()
      await expect(promise).rejects.toBeInstanceOf(EditorTaskRuntimeDisposedError)
    } finally {
      vi.useRealTimers()
    }
  })
})
