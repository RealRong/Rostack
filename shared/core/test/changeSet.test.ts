import { describe, expect, test } from 'vitest'
import { changeSet } from '@shared/core'

describe('changeSet', () => {
  test('tracks canonical add update remove net effects', () => {
    const bucket = changeSet.create<string>()

    changeSet.markAdded(bucket, 'a')
    changeSet.markUpdated(bucket, 'a')
    changeSet.markRemoved(bucket, 'a')
    changeSet.markAdded(bucket, 'b')
    changeSet.markUpdated(bucket, 'c')

    expect(bucket).toEqual({
      added: new Set(['b']),
      updated: new Set(['c']),
      removed: new Set()
    })
    expect(changeSet.touched(bucket)).toEqual(new Set(['b', 'c']))
  })

  test('assigns between canonical buckets', () => {
    const source = changeSet.create<string>()
    changeSet.markAdded(source, 'a')
    changeSet.markRemoved(source, 'b')

    const target = changeSet.create<string>()
    changeSet.markUpdated(target, 'c')
    changeSet.assign(target, source)

    expect(target).toEqual({
      added: new Set(['a']),
      updated: new Set(),
      removed: new Set(['b'])
    })
  })
})
