import { describe, expect, test } from 'vitest'
import { keySet } from '../src/delta'

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

  test('clones key sets without sharing mutable set instances', () => {
    const source = keySet.some(['a', 'b'])
    const cloned = keySet.clone(source)

    expect(cloned).toEqual({
      kind: 'some',
      keys: new Set(['a', 'b'])
    })
    expect(cloned).not.toBe(source)
    if (source.kind === 'some' && cloned.kind === 'some') {
      expect(cloned.keys).not.toBe(source.keys)
    }
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
