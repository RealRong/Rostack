import { describe, expect, test } from 'vitest'
import { store } from '@shared/core'
import { createStructKeyedStore } from '../../src/store/struct'

describe('struct stores', () => {
  test('reuses previous struct value when all fields are equal', () => {
    const left = store.value({
      x: 0,
      y: 0
    })
    const right = store.value(1)
    const combined = store.combine({
      fields: {
        point: {
          get: () => store.read(left),
          isEqual: (before, after) => (
            before.x === after.x
            && before.y === after.y
          )
        },
        count: {
          get: () => store.read(right)
        }
      }
    })

    const initial = combined.get()
    const values: typeof initial[] = []
    const unsubscribe = combined.subscribe(() => {
      values.push(combined.get())
    })

    left.set({
      x: 0,
      y: 0
    })
    expect(combined.get()).toBe(initial)

    right.set(2)
    expect(combined.get()).not.toBe(initial)
    expect(values).toHaveLength(1)
    expect(values[0]).toEqual({
      point: {
        x: 0,
        y: 0
      },
      count: 2
    })

    unsubscribe()
  })

  test('reuses keyed struct entries when the selected fields stay equal', () => {
    const source = store.value(new Map([
      ['left', 1],
      ['right', 2]
    ]))
    const shared = store.value('stable')
    const combined = createStructKeyedStore<string, {
      count: number
      label: string
    }>({
      fields: {
        count: {
          get: (key) => store.read(source).get(key) ?? 0
        },
        label: {
          get: () => store.read(shared)
        }
      }
    })

    const initial = combined.get('left')
    const values: typeof initial[] = []
    const unsubscribe = combined.subscribe('left', () => {
      values.push(combined.get('left'))
    })

    source.set(new Map([
      ['left', 1],
      ['right', 3]
    ]))
    expect(combined.get('left')).toBe(initial)

    shared.set('next')
    expect(combined.get('left')).not.toBe(initial)
    expect(values).toHaveLength(1)
    expect(values[0]).toEqual({
      count: 1,
      label: 'next'
    })

    unsubscribe()
  })
})
