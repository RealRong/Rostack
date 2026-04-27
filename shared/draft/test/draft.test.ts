import { describe, expect, test } from 'vitest'
import type { EntityTable } from '@shared/core'
import { draft } from '@shared/draft'

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
      draft.path.of('nested', 'count'),
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
    draft.path.set(current, draft.path.of('data', 'meta', 'title'), 'B')
    draft.path.unset(current, draft.path.of('data', 'meta', 'keep'))

    expect(draft.path.get(current, draft.path.of('data', 'meta', 'title'))).toBe('B')
    expect(draft.path.get(current, draft.path.of('data', 'meta', 'keep'))).toBeUndefined()
  })

  test('path exposes structural helper operations', () => {
    const rootPath = draft.path.root()
    const entry = draft.path.of('blocks', 1, 'title')
    const parent = draft.path.parent(entry)

    expect(draft.path.eq(rootPath, [])).toBe(true)
    expect(draft.path.startsWith(entry, draft.path.of('blocks', 1))).toBe(true)
    expect(draft.path.overlaps(entry, draft.path.of('blocks', 1))).toBe(true)
    expect(draft.path.append(draft.path.of('blocks'), 1, 'title')).toEqual(entry)
    expect(parent).toEqual(['blocks', 1])
    expect(draft.path.toString(entry)).toBe('[\"blocks\",1,\"title\"]')
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

  test('patch applies structural record mutations', () => {
    const result = draft.patch.apply({
      meta: {
        title: 'A'
      }
    }, {
      op: 'set',
      path: draft.path.of('meta', 'title'),
      value: 'B'
    })

    expect(result).toEqual({
      ok: true,
      value: {
        meta: {
          title: 'B'
        }
      }
    })
    expect(draft.patch.has(result.ok ? result.value : undefined, draft.path.of('meta', 'title'))).toBe(true)
    expect(draft.patch.read(result.ok ? result.value : undefined, draft.path.of('meta', 'title'))).toBe('B')
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
      ids: ['a']
    }

    const table = draft.entityTable(base)
    table.patch('a', {
      name: 'AA'
    })

    const next = table.finish()
    expect(next).not.toBe(base)
    expect(next.byId).not.toBe(base.byId)
    expect(next.ids).toBe(base.ids)
    expect(next.byId.a?.name).toBe('AA')
  })
})
