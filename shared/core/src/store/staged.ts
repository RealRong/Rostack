import type { Equality } from '../equality'
import {
  batch,
  queueListeners
} from './batch'
import {
  collectChangedKeys
} from './keyed'
import {
  notifyListeners
} from './listeners'
import {
  guardPlainGet,
  guardPlainKeyedGet
} from './read'
import {
  INTERNAL_KEYED_SUBSCRIBE,
  INTERNAL_SUBSCRIBE,
  type InternalKeyedReadStore,
  type InternalReadStore
} from './runtime'
import type {
  StagedKeyedStore,
  StagedValueStore
} from './types'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

const NO_PENDING = Symbol('shared-core-store-no-pending')
const CLEAR_PENDING = Symbol('shared-core-store-clear-pending')

export const createStagedValueStore = <T,>({
  schedule,
  initial,
  isEqual = sameValue
}: {
  schedule: () => void
  initial: T
  isEqual?: Equality<T>
}): StagedValueStore<T> => {
  let current = initial
  let pending: T | typeof NO_PENDING | typeof CLEAR_PENDING = NO_PENDING
  const publicListeners = new Set<() => void>()
  const internalListeners = new Set<() => void>()

  const publish = () => {
    batch(() => {
      notifyListeners(internalListeners)
      queueListeners(publicListeners)
    })
  }

  return {
    get: guardPlainGet(() => current),
    subscribe: listener => {
      publicListeners.add(listener)
      return () => {
        publicListeners.delete(listener)
      }
    },
    [INTERNAL_SUBSCRIBE]: (listener: () => void) => {
      internalListeners.add(listener)
      return () => {
        internalListeners.delete(listener)
      }
    },
    write: next => {
      pending = next
      schedule()
    },
    clear: () => {
      pending = CLEAR_PENDING
      if (isEqual(current, initial)) {
        return
      }

      current = initial
      publish()
    },
    flush: () => {
      if (pending === NO_PENDING) {
        return
      }

      const next = pending === CLEAR_PENDING
        ? initial
        : pending

      pending = NO_PENDING
      if (isEqual(current, next)) {
        return
      }

      current = next
      publish()
    },
    isEqual
  } as StagedValueStore<T> & InternalReadStore<T>
}

export const createStagedKeyedStore = <Key, Value, Input>({
  schedule,
  emptyState,
  emptyValue,
  build,
  isEqual = sameValue
}: {
  schedule: () => void
  emptyState: ReadonlyMap<Key, Value>
  emptyValue: Value
  build: (input: Input) => ReadonlyMap<Key, Value>
  isEqual?: Equality<Value>
}): StagedKeyedStore<Key, Value, Input> => {
  let current = emptyState
  let pending: Input | typeof NO_PENDING = NO_PENDING
  const publicListenersByKey = new Map<Key, Set<() => void>>()
  const internalListenersByKey = new Map<Key, Set<() => void>>()

  const notifyKey = (
    listenersByKey: ReadonlyMap<Key, ReadonlySet<() => void>>,
    key: Key
  ) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }

    notifyListeners(listeners)
  }

  const queueKey = (
    listenersByKey: ReadonlyMap<Key, ReadonlySet<() => void>>,
    key: Key
  ) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }

    queueListeners(listeners)
  }

  const commit = (
    next: ReadonlyMap<Key, Value>
  ) => {
    const previous = current
    if (previous === next) {
      return
    }

    current = next
    batch(() => {
      collectChangedKeys(previous, next).forEach(key => {
        const previousValue = previous.get(key) ?? emptyValue
        const nextValue = next.get(key) ?? emptyValue
        if (isEqual(previousValue, nextValue)) {
          return
        }

        notifyKey(internalListenersByKey, key)
        queueKey(publicListenersByKey, key)
      })
    })
  }

  const subscribeKey = (
    listenersByKey: Map<Key, Set<() => void>>,
    key: Key,
    listener: () => void
  ) => {
    const listeners = listenersByKey.get(key) ?? new Set<() => void>()
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
  }

  return {
    get: guardPlainKeyedGet((key: Key) => current.get(key) ?? emptyValue),
    all: () => current,
    subscribe: (key, listener) => subscribeKey(publicListenersByKey, key, listener),
    [INTERNAL_KEYED_SUBSCRIBE]: (key: Key, listener: () => void) => subscribeKey(
      internalListenersByKey,
      key,
      listener
    ),
    write: next => {
      pending = next
      schedule()
    },
    clear: () => {
      pending = NO_PENDING
      if (current === emptyState) {
        return
      }

      commit(emptyState)
    },
    flush: () => {
      if (pending === NO_PENDING) {
        return
      }

      const next = pending
      pending = NO_PENDING
      commit(build(next))
    },
    isEqual
  } as StagedKeyedStore<Key, Value, Input> & InternalKeyedReadStore<Key, Value>
}
