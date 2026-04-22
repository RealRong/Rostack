import type { Equality } from '../equality'
import {
  batch,
  queueListeners
} from './batch'
import {
  createDerivedStore
} from './derived'
import {
  createKeyedDerivedStore
} from './family'
import {
  notifyListeners
} from './listeners'
import {
  createFrameTask
} from '../frame'
import {
  collectChangedKeys
} from './keyed'
import {
  guardPlainGet,
  guardPlainKeyedGet,
  peek,
  read
} from './read'
import {
  INTERNAL_KEYED_SUBSCRIBE,
  INTERNAL_SUBSCRIBE,
  type InternalKeyedReadStore,
  type InternalReadStore
} from './runtime'
import type {
  KeyedReadStore,
  ReadStore,
  StoreSchedule
} from './types'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

const createScheduleTask = (
  flush: () => void,
  schedule: StoreSchedule
) => {
  if (schedule === 'frame') {
    return createFrameTask(flush, {
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
  isEqual = sameValue,
  schedule = 'sync'
}: {
  source: ReadStore<Source>
  select: (value: Source) => Value
  isEqual?: Equality<Value>
  schedule?: StoreSchedule
}): ReadStore<Value> => {
  if (schedule === 'sync') {
    return createDerivedStore({
      get: () => select(read(source)),
      isEqual
    })
  }

  let current = select(peek(source))
  let hasValue = true
  let tracking = false
  let publicCount = 0
  let internalCount = 0
  let pendingSource: Source | undefined
  let hasPending = false
  let unsubscribeSource = () => {}
  const publicListeners = new Set<() => void>()
  const internalListeners = new Set<() => void>()

  const commit = (
    next: Value
  ) => {
    if (hasValue && isEqual(current, next)) {
      return
    }

    current = next
    hasValue = true
    batch(() => {
      notifyListeners(internalListeners)
      queueListeners(publicListeners)
    })
  }

  const stopTracking = () => {
    tracking = false
    hasPending = false
    pendingSource = undefined
    unsubscribeSource()
    unsubscribeSource = () => {}
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
    pendingSource = peek(source)
    hasPending = true
    task.schedule()
  }

  const ensureTracking = () => {
    if (tracking || publicCount + internalCount === 0) {
      return
    }

    tracking = true
    current = select(peek(source))
    hasValue = true
    unsubscribeSource = source.subscribe(handleSourceChange)
  }

  const subscribe = (
    listeners: Set<() => void>,
    countRef: 'public' | 'internal',
    listener: () => void
  ) => {
    listeners.add(listener)
    if (countRef === 'public') {
      publicCount += 1
    } else {
      internalCount += 1
    }
    ensureTracking()

    return () => {
      listeners.delete(listener)
      if (countRef === 'public') {
        publicCount -= 1
      } else {
        internalCount -= 1
      }

      if (publicCount + internalCount > 0) {
        return
      }

      task.cancel()
      stopTracking()
    }
  }

  return {
    get: guardPlainGet(() => {
      if (!tracking) {
        current = select(peek(source))
        hasValue = true
      }

      return current
    }),
    subscribe: listener => subscribe(publicListeners, 'public', listener),
    [INTERNAL_SUBSCRIBE]: (listener: () => void) => subscribe(
      internalListeners,
      'internal',
      listener
    ),
    isEqual
  } as InternalReadStore<Value>
}

export const createProjectedKeyedStore = <Source, Key, Value>({
  source,
  select,
  emptyValue,
  isEqual = sameValue,
  schedule = 'sync'
}: {
  source: ReadStore<Source>
  select: (value: Source) => ReadonlyMap<Key, Value>
  emptyValue: Value
  isEqual?: Equality<Value>
  schedule?: StoreSchedule
}): KeyedReadStore<Key, Value> => {
  if (schedule === 'sync') {
    return createKeyedDerivedStore({
      get: (key: Key) => select(read(source)).get(key) ?? emptyValue,
      isEqual
    })
  }

  let current = select(peek(source))
  let tracking = false
  let subscriberCount = 0
  let pendingSource: Source | undefined
  let hasPending = false
  let unsubscribeSource = () => {}
  const publicListenersByKey = new Map<Key, Set<() => void>>()
  const internalListenersByKey = new Map<Key, Set<() => void>>()

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

  const stopTracking = () => {
    tracking = false
    hasPending = false
    pendingSource = undefined
    unsubscribeSource()
    unsubscribeSource = () => {}
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
    pendingSource = peek(source)
    hasPending = true
    task.schedule()
  }

  const ensureTracking = () => {
    if (tracking || subscriberCount === 0) {
      return
    }

    tracking = true
    current = select(peek(source))
    unsubscribeSource = source.subscribe(handleSourceChange)
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
    subscriberCount += 1
    ensureTracking()

    return () => {
      const currentListeners = listenersByKey.get(key)
      if (currentListeners) {
        currentListeners.delete(listener)
        if (currentListeners.size === 0) {
          listenersByKey.delete(key)
        }
      }

      subscriberCount -= 1
      if (subscriberCount > 0) {
        return
      }

      task.cancel()
      stopTracking()
    }
  }

  return {
    get: guardPlainKeyedGet((key: Key) => {
      if (!tracking) {
        current = select(peek(source))
      }

      return current.get(key) ?? emptyValue
    }),
    subscribe: (key, listener) => subscribeKey(publicListenersByKey, key, listener),
    [INTERNAL_KEYED_SUBSCRIBE]: (key: Key, listener: () => void) => subscribeKey(
      internalListenersByKey,
      key,
      listener
    ),
    isEqual
  } as InternalKeyedReadStore<Key, Value>
}
