import { describe, expect, test } from 'vitest'
import { entityDelta, idDelta } from '../src'

describe('entityDelta', () => {
  test('normalizes remove-over-set conflicts', () => {
    expect(entityDelta.normalize({
      order: true,
      set: ['a', 'b', 'a'],
      remove: ['b', 'c', 'c']
    })).toEqual({
      order: true,
      set: ['a'],
      remove: ['b', 'c']
    })
  })

  test('builds from a change set', () => {
    const changes = idDelta.create<string>()
    idDelta.add(changes, 'a')
    idDelta.update(changes, 'b')
    idDelta.remove(changes, 'c')

    expect(entityDelta.fromChangeSet({
      changes,
      order: true
    })).toEqual({
      order: true,
      set: ['a', 'b'],
      remove: ['c']
    })
  })

  test('builds from snapshots', () => {
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
