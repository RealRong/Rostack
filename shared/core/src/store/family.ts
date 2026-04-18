import type { Equality } from '../equality'
import {
  createDerivedNode,
  type DerivedNode
} from './derived'
import {
  INTERNAL_KEYED_SUBSCRIBE,
  INTERNAL_SUBSCRIBE,
  type InternalKeyedReadStore
} from './runtime'
import type {
  KeyedReadStore,
  Listener
} from './types'

interface FamilyEntry<K, T> {
  key: K
  node: DerivedNode<T>
  idle: boolean
}

export const createKeyedDerivedStore = <K, T>(
  options: {
    get: (key: K) => T
    isEqual?: Equality<T>
    keyOf?: (key: K) => unknown
  }
): KeyedReadStore<K, T> => {
  const cache = new Map<unknown, FamilyEntry<K, T>>()
  const pendingIdleCacheKeys = new Set<unknown>()
  let idleCleanupScheduled = false

  const flushIdleEntries = () => {
    idleCleanupScheduled = false
    const cacheKeys = Array.from(pendingIdleCacheKeys)
    pendingIdleCacheKeys.clear()

    cacheKeys.forEach(cacheKey => {
      const entry = cache.get(cacheKey)
      if (!entry || !entry.idle || entry.node.subscriberCount() > 0) {
        return
      }

      entry.node.dispose()
      cache.delete(cacheKey)
    })
  }

  const scheduleIdleCleanup = () => {
    if (idleCleanupScheduled) {
      return
    }

    idleCleanupScheduled = true
    queueMicrotask(flushIdleEntries)
  }

  const resolveStore = (
    key: K
  ): DerivedNode<T> => {
    const cacheKey = options.keyOf ? options.keyOf(key) : key
    const cached = cache.get(cacheKey)
    if (cached) {
      cached.key = key
      cached.idle = false
      return cached.node
    }

    const entry: FamilyEntry<K, T> = {
      key,
      idle: false,
      node: undefined as unknown as DerivedNode<T>
    }

    entry.node = createDerivedNode<T>({
      get: () => options.get(entry.key),
      ...(options.isEqual ? { isEqual: options.isEqual } : {}),
      onIdle: () => {
        entry.idle = true
        pendingIdleCacheKeys.add(cacheKey)
        scheduleIdleCleanup()
      }
    })

    cache.set(cacheKey, entry)
    return entry.node
  }

  return {
    get: key => resolveStore(key).get(),
    subscribe: (key: K, listener: Listener) => resolveStore(key).subscribe(listener),
    [INTERNAL_KEYED_SUBSCRIBE]: (key: K, listener: Listener) => (
      resolveStore(key)[INTERNAL_SUBSCRIBE]!(listener)
    ),
    ...(options.isEqual ? { isEqual: options.isEqual } : {})
  } as InternalKeyedReadStore<K, T>
}
