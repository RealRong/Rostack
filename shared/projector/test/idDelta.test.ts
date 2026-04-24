import { describe, expect, test } from 'vitest'
import { idDelta } from '../src'

describe('idDelta', () => {
  test('tracks canonical add update remove net effects', () => {
    const bucket = idDelta.create<string>()

    idDelta.add(bucket, 'a')
    idDelta.update(bucket, 'a')
    idDelta.remove(bucket, 'a')
    idDelta.add(bucket, 'b')
    idDelta.update(bucket, 'c')

    expect(bucket).toEqual({
      added: new Set(['b']),
      updated: new Set(['c']),
      removed: new Set()
    })
    expect(idDelta.touched(bucket)).toEqual(new Set(['b', 'c']))
  })

  test('assigns between canonical buckets', () => {
    const source = idDelta.create<string>()
    idDelta.add(source, 'a')
    idDelta.remove(source, 'b')

    const target = idDelta.create<string>()
    idDelta.update(target, 'c')
    idDelta.assign(target, source)

    expect(target).toEqual({
      added: new Set(['a']),
      updated: new Set(),
      removed: new Set(['b'])
    })
  })
})
