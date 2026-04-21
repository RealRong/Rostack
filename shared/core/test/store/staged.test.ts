import { describe, expect, test } from 'vitest'
import { store as coreStore } from '@shared/core'



describe('staged stores', () => {
  test('value store keeps pending writes invisible until flush and clear resets immediately', () => {
    let scheduled = 0
    const stagedStore = coreStore.createStagedValueStore({
      initial: 0,
      schedule: () => {
        scheduled += 1
      }
    })

    stagedStore.write(2)

    expect(scheduled).toBe(1)
    expect(stagedStore.get()).toBe(0)

    stagedStore.flush()

    expect(stagedStore.get()).toBe(2)

    stagedStore.clear()

    expect(stagedStore.get()).toBe(0)
  })

  test('keyed store flushes built maps and clear restores empty state', () => {
    let scheduled = 0
    const stagedStore = coreStore.createStagedKeyedStore<string, number, Array<readonly [string, number]>>({
      schedule: () => {
        scheduled += 1
      },
      emptyState: new Map(),
      emptyValue: 0,
      build: input => new Map(input)
    })

    stagedStore.write([['left', 5]])

    expect(scheduled).toBe(1)
    expect(stagedStore.get('left')).toBe(0)

    stagedStore.flush()

    expect(stagedStore.get('left')).toBe(5)

    stagedStore.clear()

    expect(stagedStore.get('left')).toBe(0)
  })
})
