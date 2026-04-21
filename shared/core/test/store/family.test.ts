import { describe, expect, test, vi } from 'vitest'
import { store } from '@shared/core'



describe('createKeyedDerivedStore', () => {
  test('continues to work after idle eviction when using keyOf', () => {
    const source = store.createValueStore(new Map([
      ['left', 1],
      ['right', 2],
      ['extra', 3]
    ]))
    const family = store.createKeyedDerivedStore({
      keyOf: key => key.id,
      get: (key: { id: string }) => store.read(source).get(key.id) ?? 0
    })

    const left = {
      id: 'left'
    }

    const values: number[] = []
    const unsubscribe = family.subscribe(left, () => {
      values.push(family.get(left))
    })

    source.set(new Map([
      ['left', 4],
      ['right', 2],
      ['extra', 3]
    ]))

    expect(values).toEqual([4])

    unsubscribe()

    family.get({
      id: 'right'
    })
    family.get({
      id: 'extra'
    })

    expect(family.get({
      id: 'left'
    })).toBe(4)
  })

  test('schedules idle cleanup asynchronously and keeps a key alive when it is read again before cleanup', () => {
    const queuedTasks: Array<() => void> = []
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, 'queueMicrotask')
      .mockImplementation(task => {
        queuedTasks.push(task)
      })
    try {
      let dependencySubscribers = 0
      const source = store.createReadStore({
        get: () => 7,
        subscribe: () => {
          dependencySubscribers += 1
          return () => {
            dependencySubscribers -= 1
          }
        }
      })

      let getCalls = 0
      const family = store.createKeyedDerivedStore({
        keyOf: key => key.id,
        get: (key: { id: string }) => {
          getCalls += 1
          return store.read(source) + key.id.length
        }
      })

      const left = {
        id: 'left'
      }

      const unsubscribe = family.subscribe(left, () => {})
      expect(getCalls).toBe(1)
      expect(dependencySubscribers).toBe(1)

      unsubscribe()

      expect(dependencySubscribers).toBe(0)
      expect(queueMicrotaskSpy).toHaveBeenCalledTimes(1)
      expect(queuedTasks).toHaveLength(1)

      expect(family.get(left)).toBe(11)
      expect(getCalls).toBe(2)
      expect(dependencySubscribers).toBe(1)

      queuedTasks[0]()

      expect(dependencySubscribers).toBe(1)
      expect(family.get(left)).toBe(11)
      expect(getCalls).toBe(2)
    } finally {
      queueMicrotaskSpy.mockRestore()
    }
  })
})
