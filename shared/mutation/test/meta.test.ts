import { describe, expect, test } from 'vitest'
import { meta, type OpMetaTable } from '@shared/mutation'

type TestOp =
  | { type: 'doc.rename' }
  | { type: 'doc.reindex' }

describe('meta', () => {
  test('creates lookup table and resolves defaults', () => {
    const table = meta.create<TestOp>({
      'doc.rename': {
        family: 'doc'
      },
      'doc.reindex': {
        family: 'doc',
        sync: 'checkpoint',
        history: false
      }
    })

    expect(meta.get(table, 'doc.rename')).toEqual({
      family: 'doc'
    })
    expect(meta.isLive(table, 'doc.rename')).toBe(true)
    expect(meta.isLive(table, 'doc.reindex')).toBe(false)
    expect(meta.tracksHistory(table, 'doc.rename')).toBe(true)
    expect(meta.tracksHistory(table, 'doc.reindex')).toBe(false)
  })

  test('throws on unknown operation type', () => {
    const table = meta.create<TestOp>({
      'doc.rename': {
        family: 'doc'
      },
      'doc.reindex': {
        family: 'doc'
      }
    }) as OpMetaTable<TestOp>

    expect(() => meta.get(
      table,
      'missing.type' as TestOp['type']
    )).toThrow('Unknown operation meta: missing.type')
  })
})
