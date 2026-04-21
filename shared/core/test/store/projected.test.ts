import { describe, expect, test } from 'vitest'
import { store } from '@shared/core'



const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('projected stores', () => {
  test('microtask projected store publishes the latest value to derived dependents', async () => {
    const source = store.createValueStore({
      count: 0
    })
    const projected = store.createProjectedStore({
      source,
      select: value => value.count,
      schedule: 'microtask'
    })
    const doubled = store.createDerivedStore({
      get: () => store.read(projected) * 2
    })

    const values: number[] = []
    const unsubscribe = doubled.subscribe(() => {
      values.push(doubled.get())
    })

    source.set({
      count: 1
    })
    source.set({
      count: 2
    })

    await flushMicrotasks()

    expect(doubled.get()).toBe(4)
    expect(values).toEqual([4])

    unsubscribe()
  })

  test('microtask projected keyed store notifies only changed keys', async () => {
    const source = store.createValueStore(new Map([
      ['left', 1],
      ['right', 2]
    ]))
    const projected = store.createProjectedKeyedStore({
      source,
      select: value => value,
      emptyValue: 0,
      schedule: 'microtask'
    })

    const values: number[] = []
    const unsubscribe = projected.subscribe('left', () => {
      values.push(projected.get('left'))
    })

    source.set(new Map([
      ['left', 3],
      ['right', 2]
    ]))

    await flushMicrotasks()

    expect(projected.get('left')).toBe(3)
    expect(values).toEqual([3])

    unsubscribe()
  })
})
