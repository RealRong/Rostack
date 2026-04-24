import { describe, expect, test } from 'vitest'
import { keySet } from '@shared/core'

describe('keySet', () => {
  test('unions some sets and preserves all', () => {
    expect(keySet.union(
      keySet.some(['a']),
      keySet.some(['b', 'a'])
    )).toEqual({
      kind: 'some',
      keys: new Set(['a', 'b'])
    })

    expect(keySet.union(
      keySet.some(['a']),
      keySet.all<string>()
    )).toEqual({
      kind: 'all'
    })
  })

  test('subtracts from some sets and materializes all sets', () => {
    expect(keySet.subtract(
      keySet.some(['a', 'b', 'c']),
      ['b']
    )).toEqual({
      kind: 'some',
      keys: new Set(['a', 'c'])
    })

    expect(keySet.materialize(
      keySet.all<string>(),
      ['x', 'y']
    )).toEqual(['x', 'y'])
  })

  test('requires allKeys when subtracting from all', () => {
    expect(() => {
      keySet.subtract(
        keySet.all<string>(),
        ['a']
      )
    }).toThrow('Cannot subtract from an all key set without allKeys.')
  })
})
