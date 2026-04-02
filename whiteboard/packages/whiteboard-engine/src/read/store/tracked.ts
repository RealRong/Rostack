import {
  createKeyedStore,
  type KeyedReadStore
} from '../../store'

const isSameValue = <T,>(left: T, right: T) => Object.is(left, right)

export const createTrackedRead = <Key, Value,>({
  emptyValue,
  read,
  isEmpty = (value) => isSameValue(value, emptyValue)
}: {
  emptyValue: Value
  read: (key: Key) => Value
  isEmpty?: (value: Value) => boolean
}) => {
  const counts = new Map<Key, number>()
  const tracked = createKeyedStore<Key, Value>({
    emptyValue
  })

  const item: KeyedReadStore<Key, Value> = {
    get: (key) => read(key),
    subscribe: (key, listener) => {
      counts.set(key, (counts.get(key) ?? 0) + 1)

      const current = read(key)
      if (isEmpty(current)) {
        tracked.delete(key)
      } else {
        tracked.set(key, current)
      }

      const unsubscribe = tracked.subscribe(key, listener)
      return () => {
        unsubscribe()
        const nextCount = (counts.get(key) ?? 1) - 1
        if (nextCount > 0) {
          counts.set(key, nextCount)
          return
        }

        counts.delete(key)
        tracked.delete(key)
      }
    }
  }

  return {
    item,
    size: () => counts.size,
    keys: () => counts.keys(),
    sync: (keys: Iterable<Key>) => {
      const set: Array<readonly [Key, Value]> = []
      const del: Key[] = []

      for (const key of keys) {
        if (!counts.has(key)) {
          continue
        }

        const current = read(key)
        if (isEmpty(current)) {
          del.push(key)
        } else {
          set.push([key, current] as const)
        }
      }

      if (!set.length && !del.length) {
        return
      }

      tracked.patch({
        set,
        delete: del
      })
    }
  }
}
