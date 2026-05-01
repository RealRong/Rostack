import { describe, expect, test } from 'vitest'
import { createFrameValueStore } from '../../src/store/frame'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('frame stores', () => {
  test('microtask fallback flushes staged writes asynchronously', async () => {
    const frameStore = createFrameValueStore({
      initial: 0,
      fallback: 'microtask'
    })

    const values: number[] = []
    const unsubscribe = frameStore.subscribe(() => {
      values.push(frameStore.get())
    })

    frameStore.write(1)

    expect(frameStore.get()).toBe(0)

    await flushMicrotasks()

    expect(frameStore.get()).toBe(1)
    expect(values).toEqual([1])

    unsubscribe()
  })

  test('clear cancels pending frame work and restores the initial value immediately', async () => {
    const frameStore = createFrameValueStore({
      initial: 0,
      fallback: 'microtask'
    })

    frameStore.write(2)
    frameStore.clear()

    await flushMicrotasks()

    expect(frameStore.get()).toBe(0)
  })
})
