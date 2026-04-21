import { describe, expect, test } from 'vitest'
import { store } from '@shared/core'



describe('createDerivedStore', () => {
  test('keeps the published snapshot reference when recompute stays equal and still refreshes dependencies', () => {
    const active = store.createValueStore<'left' | 'right'>('left')
    const left = store.createValueStore({
      count: 1
    })
    const right = store.createValueStore({
      count: 1
    })
    const derived = store.createDerivedStore({
      get: () => store.read(active) === 'left'
        ? store.read(left)
        : store.read(right),
      isEqual: (previous, next) => previous.count === next.count
    })

    const first = derived.get()
    const values: Array<{ count: number }> = []
    const unsubscribe = derived.subscribe(() => {
      values.push(derived.get())
    })

    active.set('right')

    expect(derived.get()).toBe(first)
    expect(values).toEqual([])

    left.set({
      count: 2
    })

    expect(derived.get()).toBe(first)
    expect(values).toEqual([])

    right.set({
      count: 2
    })

    expect(values).toHaveLength(1)
    expect(values[0]).toBe(derived.get())
    expect(derived.get()).not.toBe(first)
    expect(derived.get().count).toBe(2)

    unsubscribe()
  })

  test('allows listener side effects that invalidate dependencies after recompute commits', () => {
    const left = store.createValueStore(0)
    const right = store.createValueStore(0)
    const total = store.createDerivedStore({
      get: () => store.read(left) + store.read(right)
    })

    const values: number[] = []
    const unsubscribe = total.subscribe(() => {
      values.push(total.get())

      if (right.get() === 0) {
        right.set(1)
      }
    })

    expect(() => {
      left.set(1)
    }).not.toThrow()
    expect(total.get()).toBe(2)
    expect(values).toEqual([1, 2])

    unsubscribe()
  })

  test('still throws on direct circular derived dependencies', () => {
    let right!: store.ReadStore<number>
    const left = store.createDerivedStore({
      get: () => store.read(right) + 1
    })
    right = store.createDerivedStore({
      get: () => store.read(left) + 1
    })

    expect(() => {
      left.get()
    }).toThrow('Circular derived store dependency detected.')
  })
})
