import { describe, expect, test } from 'vitest'
import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'

describe('createDerivedStore', () => {
  test('allows listener side effects that invalidate dependencies after recompute commits', () => {
    const left = createValueStore(0)
    const right = createValueStore(0)
    const total = createDerivedStore({
      get: () => read(left) + read(right)
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
    let right!: ReadStore<number>
    const left = createDerivedStore({
      get: () => read(right) + 1
    })
    right = createDerivedStore({
      get: () => read(left) + 1
    })

    expect(() => {
      left.get()
    }).toThrow('Circular derived store dependency detected.')
  })
})
