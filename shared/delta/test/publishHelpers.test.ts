import { describe, expect, test } from 'vitest'
import {
  createEntityDeltaSync,
  projectListChange,
  publishEntityList,
  publishStruct
} from '../src'

describe('delta publish helpers', () => {
  test('projectListChange reports added removed and order changes', () => {
    expect(projectListChange({
      previous: ['a', 'b', 'c'],
      next: ['b', 'd', 'c']
    })).toEqual({
      added: ['d'],
      removed: ['a'],
      orderChanged: true,
      changed: true
    })
  })

  test('publishEntityList reuses previous list when order is stable', () => {
    const previous = ['a', 'b'] as const

    const result = publishEntityList({
      previous,
      next: previous,
      set: ['c'],
      remove: ['d']
    })

    expect(result.value).toBe(previous)
    expect(result.delta).toEqual({
      set: ['c'],
      remove: ['d']
    })
  })

  test('publishStruct reuses previous object when all keys are stable', () => {
    const previous = {
      a: 1,
      b: 2
    }
    const next = {
      a: 1,
      b: 2
    }

    const result = publishStruct({
      previous,
      next,
      keys: ['a', 'b'] as const
    })

    expect(result.value).toBe(previous)
    expect(result.reusedNodeCount).toBe(2)
    expect(result.rebuiltNodeCount).toBe(0)
    expect(result.changed).toBe(false)
  })

  test('createEntityDeltaSync applies order set and remove patches', () => {
    const applied: Array<{
      order?: readonly string[]
      set?: readonly (readonly [string, number])[]
      remove?: readonly string[]
    }> = []

    const sync = createEntityDeltaSync<
      {
        ids: readonly string[]
        values: ReadonlyMap<string, number>
      },
      {
        order?: true
        set?: readonly string[]
        remove?: readonly string[]
      },
      typeof applied,
      string,
      number
    >({
      delta: (change) => change,
      list: (snapshot) => snapshot.ids,
      read: (snapshot, key) => snapshot.values.get(key),
      apply: (patch, sink) => {
        sink.push(patch)
      }
    })

    sync.sync({
      previous: {
        ids: ['a'],
        values: new Map([['a', 1]])
      },
      next: {
        ids: ['b', 'a'],
        values: new Map([
          ['a', 1],
          ['b', 2]
        ])
      },
      change: {
        order: true,
        set: ['b'],
        remove: ['c']
      },
      sink: applied
    })

    expect(applied).toEqual([{
      order: ['b', 'a'],
      set: [['b', 2]],
      remove: ['c']
    }])
  })
})
