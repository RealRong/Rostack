import { equal, store } from '@shared/core'


export const createProjectionRuntime = <Key, Value,>({
  initialList,
  emptyValue,
  read,
  isEmpty = (value) => equal.sameValue(value, emptyValue)
}: {
  initialList: readonly Key[]
  emptyValue: Value
  read: (key: Key) => Value
  isEmpty?: (value: Value) => boolean
}): {
  list: store.ReadStore<readonly Key[]>
  item: store.KeyedReadStore<Key, Value>
  trackedKeys: () => IterableIterator<Key>
  setList: (next: readonly Key[]) => void
  sync: (keys: Iterable<Key>) => void
} => {
  const list = store.createValueStore(initialList)
  const counts = new Map<Key, number>()
  const tracked = store.createKeyedStore<Key, Value>({
    emptyValue
  })
  const item = store.createKeyedReadStore<Key, Value>({
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
  })

  return {
    list,
    item,
    trackedKeys: () => counts.keys(),
    setList: (next) => {
      list.set(next)
    },
    sync: (keys) => {
      const set: Array<readonly [Key, Value]> = []
      const del: Key[] = []

      for (const key of keys) {
        if (!counts.has(key)) {
          continue
        }

        const current = read(key)
        if (isEmpty(current)) {
          del.push(key)
          continue
        }

        set.push([key, current] as const)
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
