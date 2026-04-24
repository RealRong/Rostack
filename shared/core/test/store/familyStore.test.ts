import { describe, expect, test, vi } from 'vitest'
import { store } from '@shared/core'

describe('createFamilyStore', () => {
  test('applies keyed patches without rebuilding untouched ids', () => {
    const family = store.createFamilyStore({
      initial: {
        ids: ['a', 'b'],
        byId: new Map([
          ['a', { value: 1 }],
          ['b', { value: 2 }]
        ])
      }
    })
    const nextIds = ['a', 'b', 'c'] as const
    const nodeSpy = vi.fn()
    const idsSpy = vi.fn()

    family.byId.subscribe.key('b', nodeSpy)
    family.ids.subscribe(idsSpy)

    family.write.apply({
      ids: nextIds,
      set: [['c', { value: 3 }]]
    })

    expect(family.read.get('a')).toEqual({ value: 1 })
    expect(family.read.get('b')).toEqual({ value: 2 })
    expect(family.read.get('c')).toEqual({ value: 3 })
    expect(family.read.family().ids).toBe(nextIds)
    expect(nodeSpy).not.toHaveBeenCalled()
    expect(idsSpy).toHaveBeenCalledTimes(1)
  })

  test('notifies only touched keys on patch updates and removals', () => {
    const family = store.createFamilyStore({
      initial: {
        ids: ['a', 'b'],
        byId: new Map([
          ['a', { value: 1 }],
          ['b', { value: 2 }]
        ])
      }
    })
    const aSpy = vi.fn()
    const bSpy = vi.fn()

    family.byId.subscribe.key('a', aSpy)
    family.byId.subscribe.key('b', bSpy)

    family.write.apply({
      set: [['a', { value: 10 }]],
      remove: ['b']
    })

    expect(family.read.get('a')).toEqual({ value: 10 })
    expect(family.read.get('b')).toBeUndefined()
    expect(aSpy).toHaveBeenCalledTimes(1)
    expect(bSpy).toHaveBeenCalledTimes(1)
  })

  test('replaces and clears the family state as a single store surface', () => {
    const family = store.createFamilyStore<string, number>()
    const idsSpy = vi.fn()
    const valueSpy = vi.fn()
    const next = {
      ids: ['x'],
      byId: new Map([
        ['x', 1]
      ])
    }

    family.ids.subscribe(idsSpy)
    family.byId.subscribe.key('x', valueSpy)

    family.write.replace(next)

    expect(family.read.family()).toEqual(next)
    expect(idsSpy).toHaveBeenCalledTimes(1)
    expect(valueSpy).toHaveBeenCalledTimes(1)

    family.write.clear()

    expect(family.read.family()).toEqual({
      ids: [],
      byId: new Map()
    })
    expect(idsSpy).toHaveBeenCalledTimes(2)
    expect(valueSpy).toHaveBeenCalledTimes(2)
  })
})
