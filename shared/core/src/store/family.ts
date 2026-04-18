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
  cacheKey: unknown
  node: DerivedNode<T>
  idleRevision: number | null
}

const EVICT_AFTER_IDLE_REVISIONS = 1

export const createKeyedDerivedStore = <K, T>(
  options: {
    get: (key: K) => T
    isEqual?: Equality<T>
    keyOf?: (key: K) => unknown
  }
): KeyedReadStore<K, T> => {
  const cache = new Map<unknown, FamilyEntry<K, T>>()
  let familyRevision = 0

  const sweep = () => {
    cache.forEach((entry, cacheKey) => {
      if (
        entry.node.subscriberCount() > 0
        || entry.idleRevision === null
        || familyRevision - entry.idleRevision <= EVICT_AFTER_IDLE_REVISIONS
      ) {
        return
      }

      entry.node.dispose()
      cache.delete(cacheKey)
    })
  }

  const resolveStore = (
    key: K
  ): DerivedNode<T> => {
    familyRevision += 1
    sweep()

    const cacheKey = options.keyOf ? options.keyOf(key) : key
    const cached = cache.get(cacheKey)
    if (cached) {
      cached.key = key
      cached.idleRevision = null
      return cached.node
    }

    const entry: FamilyEntry<K, T> = {
      key,
      cacheKey,
      idleRevision: null,
      node: undefined as unknown as DerivedNode<T>
    }

    entry.node = createDerivedNode<T>({
      get: () => options.get(entry.key),
      ...(options.isEqual ? { isEqual: options.isEqual } : {}),
      onIdle: () => {
        familyRevision += 1
        entry.idleRevision = familyRevision
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
