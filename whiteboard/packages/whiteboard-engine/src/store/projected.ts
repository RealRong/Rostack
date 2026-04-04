import { createRafTask } from '../scheduler/raf'
import type {
  KeyedReadStore,
  ReadStore,
  StoreSchedule
} from '../types/store'

const isSameValue = <T,>(prev: T, next: T) => Object.is(prev, next)

const createScheduleTask = (
  flush: () => void,
  schedule: StoreSchedule
) => {
  if (schedule === 'raf') {
    return createRafTask(flush, {
      fallback: 'microtask'
    })
  }

  if (schedule === 'microtask') {
    let queued = false
    let token = 0

    return {
      cancel: () => {
        queued = false
        token += 1
      },
      schedule: () => {
        if (queued) {
          return
        }

        queued = true
        const currentToken = token + 1
        token = currentToken
        queueMicrotask(() => {
          if (!queued || currentToken !== token) {
            return
          }

          queued = false
          flush()
        })
      }
    }
  }

  return {
    cancel: () => {},
    schedule: flush
  }
}

export const createProjectedStore = <Source, Value>({
  source,
  select,
  isEqual = isSameValue,
  schedule = 'sync'
}: {
  source: ReadStore<Source>
  select: (value: Source) => Value
  isEqual?: (left: Value, right: Value) => boolean
  schedule?: StoreSchedule
}): ReadStore<Value> => {
  let current: Value | undefined
  let hasValue = false
  let tracking = false
  let pendingSource: Source | undefined
  let hasPending = false
  let unsubscribeSource = () => {}
  const listeners = new Set<() => void>()

  const task = createScheduleTask(() => {
    if (!hasPending) {
      return
    }

    const nextSource = pendingSource as Source
    hasPending = false
    pendingSource = undefined
    commit(select(nextSource))
  }, schedule)

  const notify = () => {
    Array.from(listeners).forEach((listener) => {
      listener()
    })
  }

  const commit = (
    next: Value
  ) => {
    if (hasValue && isEqual(current as Value, next)) {
      return
    }

    current = next
    hasValue = true
    notify()
  }

  const refresh = () => {
    const next = select(source.get())
    if (!hasValue || !isEqual(current as Value, next)) {
      current = next
    }
    hasValue = true
  }

  const handleSourceChange = () => {
    if (schedule === 'sync') {
      commit(select(source.get()))
      return
    }

    pendingSource = source.get()
    hasPending = true
    task.schedule()
  }

  return {
    get: () => {
      refresh()
      return current as Value
    },
    subscribe: (listener) => {
      listeners.add(listener)

      if (!tracking) {
        tracking = true
        refresh()
        unsubscribeSource = source.subscribe(handleSourceChange)
      }

      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) {
          return
        }

        tracking = false
        hasPending = false
        pendingSource = undefined
        task.cancel()
        unsubscribeSource()
        unsubscribeSource = () => {}
      }
    }
  }
}

export const createProjectedKeyedStore = <Source, Key, Value>({
  source,
  select,
  emptyValue,
  isEqual = isSameValue,
  schedule = 'sync'
}: {
  source: ReadStore<Source>
  select: (value: Source) => ReadonlyMap<Key, Value>
  emptyValue: Value
  isEqual?: (left: Value, right: Value) => boolean
  schedule?: StoreSchedule
}): KeyedReadStore<Key, Value> => {
  let current = new Map<Key, Value>() as ReadonlyMap<Key, Value>
  let tracking = false
  let pendingSource: Source | undefined
  let hasPending = false
  let unsubscribeSource = () => {}
  const listenersByKey = new Map<Key, Set<() => void>>()

  const notify = (
    key: Key
  ) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }

    Array.from(listeners).forEach((listener) => {
      listener()
    })
  }

  const commit = (
    next: ReadonlyMap<Key, Value>
  ) => {
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

  const refresh = () => {
    current = select(source.get())
  }

  const task = createScheduleTask(() => {
    if (!hasPending) {
      return
    }

    const nextSource = pendingSource as Source
    hasPending = false
    pendingSource = undefined
    commit(select(nextSource))
  }, schedule)

  const handleSourceChange = () => {
    if (schedule === 'sync') {
      commit(select(source.get()))
      return
    }

    pendingSource = source.get()
    hasPending = true
    task.schedule()
  }

  return {
    get: (key) => {
      if (!tracking) {
        return select(source.get()).get(key) ?? emptyValue
      }

      return current.get(key) ?? emptyValue
    },
    subscribe: (key, listener) => {
      const listeners = listenersByKey.get(key) ?? new Set<() => void>()
      if (!listenersByKey.has(key)) {
        listenersByKey.set(key, listeners)
      }
      listeners.add(listener)

      if (!tracking) {
        tracking = true
        refresh()
        unsubscribeSource = source.subscribe(handleSourceChange)
      }

      return () => {
        const currentListeners = listenersByKey.get(key)
        if (!currentListeners) {
          return
        }

        currentListeners.delete(listener)
        if (!currentListeners.size) {
          listenersByKey.delete(key)
        }

        if (listenersByKey.size > 0) {
          return
        }

        tracking = false
        hasPending = false
        pendingSource = undefined
        task.cancel()
        unsubscribeSource()
        unsubscribeSource = () => {}
      }
    }
  }
}
