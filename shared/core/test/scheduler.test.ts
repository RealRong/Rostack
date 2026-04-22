import { describe, expect, test, vi } from 'vitest'
import { scheduler } from '@shared/core'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('scheduler', () => {
  test('timeout frame fallback runs once on a later tick', () => {
    vi.useFakeTimers()
    const values: number[] = []
    const task = scheduler.createFrameTask(() => {
      values.push(values.length + 1)
    })

    try {
      task.schedule()
      task.schedule()

      expect(task.isScheduled()).toBe(true)
      expect(values).toEqual([])

      vi.advanceTimersByTime(15)
      expect(values).toEqual([])

      vi.advanceTimersByTime(1)
      expect(values).toEqual([1])
      expect(task.isScheduled()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('microtask frame fallback can be cancelled before flush', async () => {
    const values: number[] = []
    const task = scheduler.createFrameTask(() => {
      values.push(1)
    }, {
      fallback: 'microtask'
    })

    task.schedule()
    task.cancel()

    await flushMicrotasks()

    expect(values).toEqual([])
    expect(task.isScheduled()).toBe(false)
  })

  test('readMonotonicNow prefers performance.now when available', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(123.5)

    try {
      expect(scheduler.readMonotonicNow()).toBe(123.5)
    } finally {
      nowSpy.mockRestore()
    }
  })
})
