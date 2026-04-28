import { describe, expect, test } from 'vitest'
import type { EntityTable } from '@shared/core'
import { draft, path, patch } from '@shared/draft'

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
    path.set(
      root.write(),
      path.of('nested', 'count'),
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
    path.set(current, path.of('data', 'meta', 'title'), 'B')
    path.unset(current, path.of('data', 'meta', 'keep'))

    expect(path.get(current, path.of('data', 'meta', 'title'))).toBe('B')
    expect(path.get(current, path.of('data', 'meta', 'keep'))).toBeUndefined()
  })

  test('path exposes structural helper operations', () => {
    const rootPath = path.root()
    const entry = path.of('blocks', 1, 'title')
    const parent = path.parent(entry)

    expect(path.eq(rootPath, '')).toBe(true)
    expect(path.startsWith(entry, path.of('blocks', 1))).toBe(true)
    expect(path.overlaps(entry, path.of('blocks', 1))).toBe(true)
    expect(path.append(path.of('blocks'), 1, 'title')).toEqual(entry)
    expect(parent).toEqual(path.of('blocks', 1))
    expect(path.toString(entry)).toBe(entry)
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
    const record = draft.table(base)

    record.set('a', 1)
    record.delete('missing' as 'a')

    expect(record.has('a')).toBe(true)
    expect(record.finish()).toBe(base)
  })

  test('patch applies structural record mutations', () => {
    const result = patch.apply({
      meta: {
        title: 'A'
      }
    }, {
      op: 'set',
      path: path.of('meta', 'title'),
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
    expect(patch.has(result.ok ? result.value : undefined, path.of('meta', 'title'))).toBe(true)
    expect(patch.read(result.ok ? result.value : undefined, path.of('meta', 'title'))).toBe('B')
  })

  test('record write applies diff and inverse with string paths', () => {
    const base = {
      data: {
        text: 'A'
      },
      style: {
        fontSize: 12
      }
    }

    const writes = {
      'data.text': 'B',
      'style.fontSize': 14,
      'style.color': '#000'
    } as const

    const next = draft.record.apply(base, writes)
    expect(next).toEqual({
      data: {
        text: 'B'
      },
      style: {
        fontSize: 14,
        color: '#000'
      }
    })

    expect(draft.record.inverse(base, writes)).toEqual({
      'data.text': 'A',
      'style.fontSize': 12,
      'style.color': undefined
    })

    expect(draft.record.diff(base, next)).toEqual(writes)
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
