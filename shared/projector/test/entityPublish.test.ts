import { describe, expect, it } from 'vitest'
import {
  idDelta,
  publishEntityFamily,
  publishEntityList
} from '../src'
import type { Family } from '../src'

const EMPTY_FAMILY: Family<string, { id: string; value: number }> = {
  ids: [],
  byId: new Map()
}

describe('publishEntityList', () => {
  it('reuses previous ids when no effective delta exists', () => {
    const previous = ['a', 'b']
    const result = publishEntityList({
      previous,
      next: ['a', 'b']
    })

    expect(result.value).toBe(previous)
    expect(result.delta).toBeUndefined()
    expect(result.changed).toBe(false)
    expect(result.action).toBe('reuse')
  })

  it('merges membership and explicit touched ids into entity delta', () => {
    const result = publishEntityList({
      previous: ['a', 'b'],
      next: ['b', 'c'],
      set: ['b'],
      remove: ['ghost']
    })

    expect(result.value).toEqual(['b', 'c'])
    expect(result.delta).toEqual({
      order: true,
      set: ['c', 'b'],
      remove: ['a', 'ghost']
    })
    expect(result.changed).toBe(true)
    expect(result.action).toBe('sync')
  })
})

describe('publishEntityFamily', () => {
  it('patches a family from authoritative touched ids and emits entity delta', () => {
    const previous: Family<string, { id: string; value: number }> = {
      ids: ['a', 'b'],
      byId: new Map([
        ['a', { id: 'a', value: 1 }],
        ['b', { id: 'b', value: 2 }]
      ])
    }
    const changes = idDelta.create<string>()
    idDelta.update(changes, 'b')
    idDelta.add(changes, 'c')

    const nextValues = new Map([
      ['a', previous.byId.get('a')!],
      ['b', { id: 'b', value: 3 }],
      ['c', { id: 'c', value: 4 }]
    ])
    const result = publishEntityFamily({
      previous,
      ids: ['a', 'c', 'b'],
      change: changes,
      read: (id) => nextValues.get(id)
    })

    expect(result.value.ids).toEqual(['a', 'c', 'b'])
    expect(result.value.byId.get('a')).toBe(previous.byId.get('a'))
    expect(result.value.byId.get('b')).toEqual({ id: 'b', value: 3 })
    expect(result.value.byId.get('c')).toEqual({ id: 'c', value: 4 })
    expect(result.change).toEqual({
      added: new Set(['c']),
      updated: new Set(['b']),
      removed: new Set()
    })
    expect(result.delta).toEqual({
      order: true,
      set: ['c', 'b']
    })
    expect(result.action).toBe('sync')
  })

  it('reuses previous family when touched ids do not produce effective change', () => {
    const changes = idDelta.create<string>()
    const result = publishEntityFamily({
      previous: EMPTY_FAMILY,
      ids: EMPTY_FAMILY.ids,
      change: changes,
      read: () => undefined
    })

    expect(result.value).toBe(EMPTY_FAMILY)
    expect(result.change).toEqual(idDelta.create<string>())
    expect(result.delta).toBeUndefined()
    expect(result.action).toBe('reuse')
  })
})
