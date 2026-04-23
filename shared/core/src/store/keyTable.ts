import type { Equality } from '../equality'
import {
  batch,
  queueListeners
} from './batch'
import {
  createKeyedDerivedStore
} from './family'
import {
  createKeyedReadStore
} from './keyed'
import {
  notifyListeners
} from './listeners'
import {
  read
} from './read'
import type {
  KeyTableStore,
  Listener
} from './types'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

const sameOptionalValue = <Value,>(
  isEqual: Equality<Value>,
  left: Value | undefined,
  right: Value | undefined
) => left === right || (
  left !== undefined
  && right !== undefined
  && isEqual(left, right)
)

const notifyKey = <Key,>(
  listenersByKey: ReadonlyMap<Key, ReadonlySet<Listener>>,
  key: Key
) => {
  const listeners = listenersByKey.get(key)
  if (!listeners?.size) {
    return
  }

  notifyListeners(listeners)
}

const queueKey = <Key,>(
  listenersByKey: ReadonlyMap<Key, ReadonlySet<Listener>>,
  key: Key
) => {
  const listeners = listenersByKey.get(key)
  if (!listeners?.size) {
    return
  }

  queueListeners(listeners)
}

export const createKeyTableStore = <Key, Value>({
  initial,
  isEqual = sameValue
}: {
  initial?: ReadonlyMap<Key, Value>
  isEqual?: Equality<Value>
} = {}): KeyTableStore<Key, Value> => {
  let current = new Map(initial)
  const publicListenersByKey = new Map<Key, Set<Listener>>()
  const internalListenersByKey = new Map<Key, Set<Listener>>()
  const listenedKeys = new Set<Key>()

  const readValue = (key: Key) => current.get(key)
  const refreshListeningState = (key: Key) => {
    if (
      publicListenersByKey.has(key)
      || internalListenersByKey.has(key)
    ) {
      listenedKeys.add(key)
      return
    }

    listenedKeys.delete(key)
  }
  const subscribeKey = (
    listenersByKey: Map<Key, Set<Listener>>,
    key: Key,
    listener: Listener
  ) => {
    const listeners = listenersByKey.get(key) ?? new Set<Listener>()
    if (!listenersByKey.has(key)) {
      listenersByKey.set(key, listeners)
    }
    listeners.add(listener)
    listenedKeys.add(key)

    return () => {
      const currentListeners = listenersByKey.get(key)
      if (!currentListeners) {
        return
      }

      currentListeners.delete(listener)
      if (!currentListeners.size) {
        listenersByKey.delete(key)
      }

      refreshListeningState(key)
    }
  }
  const notifyChangedKeys = (
    previousByKey: ReadonlyMap<Key, Value | undefined>
  ) => {
    if (!previousByKey.size) {
      return
    }

    batch(() => {
      previousByKey.forEach((previousValue, key) => {
        const nextValue = current.get(key)
        if (sameOptionalValue(isEqual, previousValue, nextValue)) {
          return
        }

        notifyKey(internalListenersByKey, key)
        queueKey(publicListenersByKey, key)
      })
    })
  }
  const notifyPatchedKeys = (
    keys: readonly Key[]
  ) => {
    if (!keys.length) {
      return
    }

    batch(() => {
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index]!
        notifyKey(internalListenersByKey, key)
        queueKey(publicListenersByKey, key)
      }
    })
  }

  const proxy = createKeyedReadStore<Key, Value | undefined>({
    get: readValue,
    subscribe: (key, listener) => subscribeKey(
      internalListenersByKey,
      key,
      listener
    ),
    isEqual: (left, right) => sameOptionalValue(isEqual, left, right)
  })

  return {
    read: {
      get: readValue,
      has: key => current.has(key),
      all: () => current,
      size: () => current.size
    },
    subscribe: {
      key: (key, listener) => subscribeKey(
        publicListenersByKey,
        key,
        listener
      )
    },
    write: {
      replace: next => {
        const previous = current
        const previousByKey = new Map<Key, Value | undefined>()

        listenedKeys.forEach(key => {
          previousByKey.set(key, previous.get(key))
        })

        current = new Map(next)
        notifyChangedKeys(previousByKey)
      },
      applyExact: patch => {
        if (!patch.set?.length && !patch.remove?.length) {
          return
        }

        const noListeners = listenedKeys.size === 0
        const changedKeys: Key[] = []

        const set = patch.set
        if (set?.length) {
          for (let index = 0; index < set.length; index += 1) {
            const [key, value] = set[index]!
            current.set(key, value)
            if (!noListeners && listenedKeys.has(key)) {
              changedKeys.push(key)
            }
          }
        }

        const remove = patch.remove
        if (remove?.length) {
          for (let index = 0; index < remove.length; index += 1) {
            const key = remove[index]!
            current.delete(key)
            if (!noListeners && listenedKeys.has(key)) {
              changedKeys.push(key)
            }
          }
        }

        if (noListeners) {
          return
        }

        notifyPatchedKeys(changedKeys)
      },
      clear: () => {
        if (!current.size) {
          return
        }

        const previousByKey = new Map<Key, Value | undefined>()
        listenedKeys.forEach(key => {
          const previous = current.get(key)
          if (previous !== undefined) {
            previousByKey.set(key, previous)
          }
        })

        current.clear()
        notifyChangedKeys(previousByKey)
      }
    },
    project: {
      field: <Projected,>(
        select: (value: Value | undefined) => Projected,
        projectedEqual = sameValue as Equality<Projected>
      ) => createKeyedDerivedStore<Key, Projected>({
        get: key => select(read(proxy, key)),
        isEqual: projectedEqual
      })
    }
  }
}
