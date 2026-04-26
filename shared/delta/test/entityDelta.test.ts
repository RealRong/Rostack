import { describe, expect, test } from 'vitest'
import { entityDelta, idDelta } from '../src'

describe('entityDelta', () => {
  test('normalizes duplicate set/remove entries', () => {
    expect(entityDelta.normalize({
      set: ['a', 'a', 'b'],
      remove: ['b', 'c', 'c']
    })).toEqual({
      set: ['a'],
      remove: ['b', 'c']
    })
  })

  test('derives from id changes', () => {
    const changes = idDelta.create<string>()
    idDelta.add(changes, 'a')
    idDelta.update(changes, 'b')
    idDelta.remove(changes, 'c')

    expect(entityDelta.fromChangeSet({
      changes
    })).toEqual({
      set: ['a', 'b'],
      remove: ['c']
    })
  })

  test('derives from snapshots', () => {
    const previous = new Map([
      ['a', 1],
      ['b', 2]
    ])
    const next = new Map([
      ['b', 3],
      ['c', 4]
    ])

    expect(entityDelta.fromSnapshots({
      previousIds: ['a', 'b'],
      nextIds: ['b', 'c'],
      previousGet: (key) => previous.get(key),
      nextGet: (key) => next.get(key)
    })).toEqual({
      order: true,
      set: ['b', 'c'],
      remove: ['a']
    })
  })
})
