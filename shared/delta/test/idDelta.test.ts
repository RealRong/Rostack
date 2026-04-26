import { describe, expect, test } from 'vitest'
import { idDelta } from '../src'

describe('idDelta', () => {
  test('tracks add update remove transitions', () => {
    const bucket = idDelta.create<string>()

    idDelta.add(bucket, 'a')
    idDelta.update(bucket, 'a')
    idDelta.remove(bucket, 'a')
    idDelta.add(bucket, 'b')
    idDelta.update(bucket, 'c')

    expect(bucket.added).toEqual(new Set(['b']))
    expect(bucket.updated).toEqual(new Set(['c']))
    expect(bucket.removed).toEqual(new Set())
  })

  test('reports touched ids', () => {
    const bucket = idDelta.create<string>()
    idDelta.add(bucket, 'b')
    idDelta.update(bucket, 'c')

    expect(idDelta.touched(bucket)).toEqual(new Set(['b', 'c']))
  })

  test('assign replaces target contents', () => {
    const source = idDelta.create<string>()
    idDelta.add(source, 'a')
    idDelta.remove(source, 'b')

    const target = idDelta.create<string>()
    idDelta.update(target, 'c')
    idDelta.assign(target, source)

    expect(target).toEqual(source)
  })
})
