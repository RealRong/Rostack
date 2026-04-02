import type {
  StagedKeyedStore,
  StagedValueStore
} from '../types/store'

type Listener = () => void

const isSameValue = <T,>(prev: T, next: T) => Object.is(prev, next)

const NO_PENDING = Symbol('no-pending')
const CLEAR_PENDING = Symbol('clear-pending')

export const createStagedValueStore = <T,>({
  schedule,
  initial,
  isEqual = isSameValue
}: {
  schedule: () => void
  initial: T
  isEqual?: (prev: T, next: T) => boolean
}): StagedValueStore<T> => {
  let current = initial
  let pending: T | typeof NO_PENDING | typeof CLEAR_PENDING = NO_PENDING
  const listeners = new Set<Listener>()

  const notify = () => {
    Array.from(listeners).forEach((listener) => {
      listener()
    })
  }

  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    write: (next) => {
      pending = next
      schedule()
    },
    clear: () => {
      pending = CLEAR_PENDING
      if (isEqual(current, initial)) {
        return
      }
      current = initial
      notify()
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
      notify()
    }
  }
}

export const createStagedKeyedStore = <Key, Value, Input>({
  schedule,
  emptyState,
  emptyValue,
  build,
  isEqual = isSameValue
}: {
  schedule: () => void
  emptyState: ReadonlyMap<Key, Value>
  emptyValue: Value
  build: (input: Input) => ReadonlyMap<Key, Value>
  isEqual?: (left: Value, right: Value) => boolean
}): StagedKeyedStore<Key, Value, Input> => {
  let current = emptyState
  let pending: Input | typeof NO_PENDING = NO_PENDING
  const listenersByKey = new Map<Key, Set<Listener>>()

  const notify = (key: Key) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }

    Array.from(listeners).forEach((listener) => {
      listener()
    })
  }

  const commit = (next: ReadonlyMap<Key, Value>) => {
    const prev = current
    if (prev === next) {
      return
    }

    current = next

    const changedKeys = new Set<Key>()
    prev.forEach((_, key) => {
      changedKeys.add(key)
    })
    next.forEach((_, key) => {
      changedKeys.add(key)
    })

    changedKeys.forEach((key) => {
      const prevValue = prev.get(key) ?? emptyValue
      const nextValue = next.get(key) ?? emptyValue
      if (isEqual(prevValue, nextValue)) {
        return
      }
      notify(key)
    })
  }

  return {
    get: (key) => current.get(key) ?? emptyValue,
    all: () => current,
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
    write: (next) => {
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
    }
  }
}
