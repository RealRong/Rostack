import { describe, expect, test } from 'vitest'
import {
  createRafValueStore
} from '@shared/core'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('raf stores', () => {
  test('microtask fallback flushes staged writes asynchronously', async () => {
    const store = createRafValueStore({
      initial: 0,
      fallback: 'microtask'
    })

    const values: number[] = []
    const unsubscribe = store.subscribe(() => {
      values.push(store.get())
    })

    store.write(1)

    expect(store.get()).toBe(0)

    await flushMicrotasks()

    expect(store.get()).toBe(1)
    expect(values).toEqual([1])

    unsubscribe()
  })

  test('clear cancels pending raf work and restores the initial value immediately', async () => {
    const store = createRafValueStore({
      initial: 0,
      fallback: 'microtask'
    })

    store.write(2)
    store.clear()

    await flushMicrotasks()

    expect(store.get()).toBe(0)
  })
})
