import { describe, expect, test } from 'vitest'
import type { EntityTable } from '@shared/core'
import { draft } from '@shared/draft'
import { path as mutationPath } from '@shared/mutation'

describe('@shared/draft', () => {
  test('root preserves untouched branch references', () => {
    const base = {
      nested: {
        count: 1
      },
      stable: {
        ok: true
      }
    }

    const root = draft.root(base)
    draft.path.set(
      root.write(),
      mutationPath.of('nested', 'count'),
      2
    )

    const next = root.finish()
    expect(next).not.toBe(base)
    expect(next.nested).not.toBe(base.nested)
    expect(next.stable).toBe(base.stable)
    expect(next.nested.count).toBe(2)
    expect(base.nested.count).toBe(1)
  })

  test('path supports nested get, set and unset on writable objects', () => {
    const root = draft.root({
      data: {
        meta: {
          title: 'A',
          keep: true
        }
      }
    })

    const current = root.write()
    draft.path.set(current, mutationPath.of('data', 'meta', 'title'), 'B')
    draft.path.unset(current, mutationPath.of('data', 'meta', 'keep'))

    expect(draft.path.get(current, mutationPath.of('data', 'meta', 'title'))).toBe('B')
    expect(draft.path.get(current, mutationPath.of('data', 'meta', 'keep'))).toBeUndefined()
  })

  test('list performs lazy copy-on-write mutations', () => {
    const base = ['a', 'b', 'c'] as const
    const list = draft.list(base)

    list.insert(1, 'x')
    list.move(3, 0)
    list.removeAt(2)

    expect(base).toEqual(['a', 'b', 'c'])
    expect(list.finish()).toEqual(['c', 'a', 'b'])
  })

  test('collection drafts preserve base references on no-op', () => {
    const baseMap = new Map([
      ['a', 1],
      ['b', 2]
    ] as const)
    const map = draft.map(baseMap)

    map.set('a', 1)
    map.delete('missing')

    expect(map.finish()).toBe(baseMap)

    const baseArray = ['a', 'b'] as const
    const array = draft.array(baseArray)

    array.mutate((next) => {
      next[0] = 'a'
      next[1] = 'b'
    })

    expect(array.finish()).not.toBe(baseArray)
    expect(array.finish()).toEqual(baseArray)
  })

  test('record keeps own-key semantics and stable finish on no-op', () => {
    const base = {
      a: 1
    }
    const record = draft.record(base)

    record.set('a', 1)
    record.delete('missing' as 'a')

    expect(record.has('a')).toBe(true)
    expect(record.finish()).toBe(base)
  })

  test('entityTable only replaces changed branches', () => {
    type Item = {
      id: string
      name: string
      meta?: {
        ok: boolean
      }
    }

    const base: EntityTable<string, Item> = {
      byId: {
        a: {
          id: 'a',
          name: 'A'
        }
      },
      order: ['a']
    }

    const table = draft.entityTable(base)
    table.patch('a', {
      name: 'AA'
    })

    const next = table.finish()
    expect(next).not.toBe(base)
    expect(next.byId).not.toBe(base.byId)
    expect(next.order).toBe(base.order)
    expect(next.byId.a?.name).toBe('AA')
  })
})
