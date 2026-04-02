import type {
  KeyedStore,
  KeyedStorePatch
} from '../types/store'

type Listener = () => void

const isSameValue = <T,>(prev: T, next: T) => Object.is(prev, next)

const notify = (
  listeners: ReadonlySet<Listener>
) => {
  Array.from(listeners).forEach((listener) => {
    listener()
  })
}

export const createKeyedStore = <Key, T,>(
  {
    emptyValue,
    initial,
    isEqual = isSameValue
  }: {
    emptyValue: T
    initial?: ReadonlyMap<Key, T>
    isEqual?: (prev: T, next: T) => boolean
  }
): KeyedStore<Key, T> => {
  let current = initial ?? new Map<Key, T>()
  const listenersByKey = new Map<Key, Set<Listener>>()

  const notifyKey = (key: Key) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }
    notify(listeners)
  }

  const readCurrent = (key: Key) => current.has(key)
    ? current.get(key) as T
    : emptyValue

  const commit = (
    next: ReadonlyMap<Key, T>,
    changedKeys?: Iterable<Key>
  ) => {
    const prev = current
    if (prev === next) {
      return
    }

    current = next

    const keys = changedKeys
      ? new Set(changedKeys)
      : new Set<Key>([
          ...prev.keys(),
          ...next.keys()
        ])

    keys.forEach((key) => {
      const prevValue = prev.has(key)
        ? prev.get(key) as T
        : emptyValue
      const nextValue = next.has(key)
        ? next.get(key) as T
        : emptyValue

      if (isEqual(prevValue, nextValue)) {
        return
      }

      notifyKey(key)
    })
  }

  const patch = (
    nextPatch: KeyedStorePatch<Key, T>
  ) => {
    const next = new Map(current)
    const changedKeys = new Set<Key>()

    if (nextPatch.set) {
      for (const [key, value] of nextPatch.set) {
        next.set(key, value)
        changedKeys.add(key)
      }
    }

    if (nextPatch.delete) {
      for (const key of nextPatch.delete) {
        if (!next.has(key)) {
          continue
        }
        next.delete(key)
        changedKeys.add(key)
      }
    }

    if (!changedKeys.size) {
      return
    }

    commit(next, changedKeys)
  }

  return {
    all: () => current,
    get: (key) => readCurrent(key),
    subscribe: (key, listener) => {
      const listeners = listenersByKey.get(key) ?? new Set<Listener>()
      if (!listenersByKey.has(key)) {
        listenersByKey.set(key, listeners)
      }
      listeners.add(listener)

      return () => {
        const currentListeners = listenersByKey.get(key)
        if (!currentListeners) {
          return
        }

        currentListeners.delete(listener)
        if (!currentListeners.size) {
          listenersByKey.delete(key)
        }
      }
    },
    set: (key, value) => {
      patch({
        set: [[key, value]]
      })
    },
    delete: (key) => {
      patch({
        delete: [key]
      })
    },
    patch,
    clear: () => {
      if (!current.size) {
        return
      }

      const prev = current
      const changedKeys = [...current.keys()]
      current = new Map<Key, T>()

      changedKeys.forEach((key) => {
        const prevValue = prev.get(key) ?? emptyValue
        if (isEqual(prevValue, emptyValue)) {
          return
        }
        notifyKey(key)
      })
    }
  }
}
