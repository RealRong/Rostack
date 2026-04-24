import { describe, expect, test } from 'vitest'
import { changeSet, entityDelta } from '@shared/core'

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
    const changes = changeSet.create<string>()
    changeSet.markAdded(changes, 'a')
    changeSet.markUpdated(changes, 'b')
    changeSet.markRemoved(changes, 'c')

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
