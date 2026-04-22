import { describe, expect, test } from 'vitest'
import { store as coreStore } from '@shared/core'



const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('raf stores', () => {
  test('microtask fallback flushes staged writes asynchronously', async () => {
    const rafStore = coreStore.createRafValueStore({
      initial: 0,
      fallback: 'microtask'
    })

    const values: number[] = []
    const unsubscribe = rafStore.subscribe(() => {
      values.push(rafStore.get())
    })

    rafStore.write(1)

    expect(rafStore.get()).toBe(0)

    await flushMicrotasks()

    expect(rafStore.get()).toBe(1)
    expect(values).toEqual([1])

    unsubscribe()
  })

  test('clear cancels pending raf work and restores the initial value immediately', async () => {
    const rafStore = coreStore.createRafValueStore({
      initial: 0,
      fallback: 'microtask'
    })

    rafStore.write(2)
    rafStore.clear()

    await flushMicrotasks()

    expect(rafStore.get()).toBe(0)
  })
})
