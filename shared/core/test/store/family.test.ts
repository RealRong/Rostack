import { describe, expect, test } from 'vitest'
import {
  createKeyedDerivedStore,
  createValueStore,
  read
} from '@shared/core'

describe('createKeyedDerivedStore', () => {
  test('continues to work after idle eviction when using keyOf', () => {
    const source = createValueStore(new Map([
      ['left', 1],
      ['right', 2],
      ['extra', 3]
    ]))
    const family = createKeyedDerivedStore({
      keyOf: key => key.id,
      get: (key: { id: string }) => read(source).get(key.id) ?? 0
    })

    const left = {
      id: 'left'
    }

    const values: number[] = []
    const unsubscribe = family.subscribe(left, () => {
      values.push(family.get(left))
    })

    source.set(new Map([
      ['left', 4],
      ['right', 2],
      ['extra', 3]
    ]))

    expect(values).toEqual([4])

    unsubscribe()

    family.get({
      id: 'right'
    })
    family.get({
      id: 'extra'
    })

    expect(family.get({
      id: 'left'
    })).toBe(4)
  })
})
