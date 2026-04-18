import type { Equality } from '../equality'
import {
  batch,
  queueListeners
} from './batch'
import {
  notifyListeners
} from './listeners'
import {
  guardPlainKeyedGet
} from './read'
import {
  INTERNAL_KEYED_SUBSCRIBE,
  type InternalKeyedReadStore
} from './runtime'
import type {
  KeyedReadStore,
  KeyedStore,
  KeyedStorePatch
} from './types'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

export const collectChangedKeys = <Key,>(
  previous: ReadonlyMap<Key, unknown>,
  next: ReadonlyMap<Key, unknown>
) => new Set<Key>([
  ...previous.keys(),
  ...next.keys()
])

export const createKeyedReadStore = <K, T>(
  options: {
    get: (key: K) => T
    subscribe: (key: K, listener: () => void) => () => void
    isEqual?: Equality<T>
  }
): KeyedReadStore<K, T> => ({
  get: guardPlainKeyedGet(options.get),
  subscribe: options.subscribe,
  [INTERNAL_KEYED_SUBSCRIBE]: options.subscribe,
  ...(options.isEqual ? { isEqual: options.isEqual } : {})
}) as InternalKeyedReadStore<K, T>

export const createKeyedStore = <Key, T,>(
  {
    emptyValue,
    initial,
    isEqual = sameValue
  }: {
    emptyValue: T
    initial?: ReadonlyMap<Key, T>
    isEqual?: Equality<T>
  }
): KeyedStore<Key, T> => {
  let current = initial ?? new Map<Key, T>()
  const publicListenersByKey = new Map<Key, Set<() => void>>()
  const internalListenersByKey = new Map<Key, Set<() => void>>()

  const notifyKey = (
    keyedListeners: ReadonlyMap<Key, ReadonlySet<() => void>>,
    key: Key
  ) => {
    const listeners = keyedListeners.get(key)
    if (!listeners?.size) {
      return
    }

    notifyListeners(listeners)
  }

  const queueKey = (
    keyedListeners: ReadonlyMap<Key, ReadonlySet<() => void>>,
    key: Key
  ) => {
    const listeners = keyedListeners.get(key)
    if (!listeners?.size) {
      return
    }

    queueListeners(listeners)
  }

  const readCurrent = (
    key: Key
  ) => current.has(key)
    ? current.get(key) as T
    : emptyValue

  const commit = (
    next: ReadonlyMap<Key, T>,
    changedKeys?: Iterable<Key>
  ) => {
    const previous = current
    if (previous === next) {
      return
    }

    current = next
    const keys = changedKeys
      ? new Set(changedKeys)
      : collectChangedKeys(previous, next)

    batch(() => {
      keys.forEach(key => {
        const previousValue = previous.has(key)
          ? previous.get(key) as T
          : emptyValue
        const nextValue = next.has(key)
          ? next.get(key) as T
          : emptyValue

        if (isEqual(previousValue, nextValue)) {
          return
        }

        notifyKey(internalListenersByKey, key)
        queueKey(publicListenersByKey, key)
      })
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

  const subscribeKey = (
    keyedListeners: Map<Key, Set<() => void>>,
    key: Key,
    listener: () => void
  ) => {
    const listeners = keyedListeners.get(key) ?? new Set<() => void>()
    if (!keyedListeners.has(key)) {
      keyedListeners.set(key, listeners)
    }
    listeners.add(listener)

    return () => {
      const currentListeners = keyedListeners.get(key)
      if (!currentListeners) {
        return
      }

      currentListeners.delete(listener)
      if (!currentListeners.size) {
        keyedListeners.delete(key)
      }
    }
  }

  return {
    all: () => current,
    get: guardPlainKeyedGet((key: Key) => readCurrent(key)),
    subscribe: (key, listener) => subscribeKey(
      publicListenersByKey,
      key,
      listener
    ),
    [INTERNAL_KEYED_SUBSCRIBE]: (key: Key, listener: () => void) => subscribeKey(
      internalListenersByKey,
      key,
      listener
    ),
    set: (key, value) => {
      patch({
        set: [[key, value]]
      })
    },
    delete: key => {
      patch({
        delete: [key]
      })
    },
    patch,
    clear: () => {
      if (!current.size) {
        return
      }

      const previous = current
      const changedKeys = [...current.keys()]
      current = new Map<Key, T>()

      batch(() => {
        changedKeys.forEach(key => {
          const previousValue = previous.get(key) ?? emptyValue
          if (isEqual(previousValue, emptyValue)) {
            return
          }

          notifyKey(internalListenersByKey, key)
          queueKey(publicListenersByKey, key)
        })
      })
    },
    isEqual
  } as KeyedStore<Key, T> & InternalKeyedReadStore<Key, T>
}
