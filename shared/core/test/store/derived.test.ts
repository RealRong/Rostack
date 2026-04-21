import { describe, expect, test } from 'vitest'
import { store } from '@shared/core'



describe('createDerivedStore', () => {
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
