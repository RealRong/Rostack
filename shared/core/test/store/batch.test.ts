import { describe, expect, test } from 'vitest'
import {
  batch,
  createDerivedStore,
  createValueStore,
  read
} from '@shared/core'

describe('batch', () => {
  test('deduplicates public notifications and flushes derived roots first', () => {
    const source = createValueStore(0)
    const total = createDerivedStore({
      get: () => read(source) * 2
    })

    const values: number[] = []
    const unsubscribe = total.subscribe(() => {
      values.push(total.get())
    })

    batch(() => {
      source.set(1)
      source.set(2)
    })

    expect(total.get()).toBe(4)
    expect(values).toEqual([4])

    unsubscribe()
  })
})
