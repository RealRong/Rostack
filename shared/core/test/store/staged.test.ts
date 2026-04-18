import { describe, expect, test } from 'vitest'
import {
  createStagedKeyedStore,
  createStagedValueStore
} from '@shared/core'

describe('staged stores', () => {
  test('value store keeps pending writes invisible until flush and clear resets immediately', () => {
    let scheduled = 0
    const store = createStagedValueStore({
      initial: 0,
      schedule: () => {
        scheduled += 1
      }
    })

    store.write(2)

    expect(scheduled).toBe(1)
    expect(store.get()).toBe(0)

    store.flush()

    expect(store.get()).toBe(2)

    store.clear()

    expect(store.get()).toBe(0)
  })

  test('keyed store flushes built maps and clear restores empty state', () => {
    let scheduled = 0
    const store = createStagedKeyedStore<string, number, Array<readonly [string, number]>>({
      schedule: () => {
        scheduled += 1
      },
      emptyState: new Map(),
      emptyValue: 0,
      build: input => new Map(input)
    })

    store.write([['left', 5]])

    expect(scheduled).toBe(1)
    expect(store.get('left')).toBe(0)

    store.flush()

    expect(store.get('left')).toBe(5)

    store.clear()

    expect(store.get('left')).toBe(0)
  })
})
