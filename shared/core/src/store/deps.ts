import type {
  KeyedReadStore,
  ReadStore,
  Unsubscribe
} from './types'
import {
  beginComputation,
  endComputation,
  INTERNAL_KEYED_SUBSCRIBE,
  INTERNAL_SUBSCRIBE,
  type InternalKeyedReadSubscription,
  type InternalReadSubscription
} from './runtime'

export const NO_KEY = Symbol('shared-core-store-no-key')

export interface Dependency {
  store: ReadStore<unknown> | KeyedReadStore<unknown, unknown>
  key: unknown
}

export interface DependencyRecord extends Dependency {
  unsubscribe: Unsubscribe
}

const sameDependency = (
  left: Dependency,
  right: Dependency
) => left.store === right.store && Object.is(left.key, right.key)

const sameDependencySequence = (
  previous: readonly DependencyRecord[],
  next: readonly Dependency[]
) => (
  previous.length === next.length
  && previous.every((item, index) => sameDependency(item, next[index]!))
)

const createDependencyRecordMap = (
  dependencies: readonly DependencyRecord[]
) => {
  const keyedByStore = new WeakMap<object, Map<unknown, DependencyRecord>>()

  dependencies.forEach(dependency => {
    const storeKey = dependency.store as object
    const storeEntries = keyedByStore.get(storeKey) ?? new Map<unknown, DependencyRecord>()
    if (!keyedByStore.has(storeKey)) {
      keyedByStore.set(storeKey, storeEntries)
    }
    storeEntries.set(dependency.key, dependency)
  })

  return {
    take: (dependency: Dependency): DependencyRecord | undefined => {
      const storeEntries = keyedByStore.get(dependency.store as object)
      if (!storeEntries) {
        return undefined
      }

      const record = storeEntries.get(dependency.key)
      if (!record) {
        return undefined
      }

      storeEntries.delete(dependency.key)
      if (storeEntries.size === 0) {
        keyedByStore.delete(dependency.store as object)
      }
      return record
    },
    leftovers: () => dependencies.flatMap(dependency => {
      const storeEntries = keyedByStore.get(dependency.store as object)
      return storeEntries?.has(dependency.key)
        ? [dependency]
        : []
    })
  }
}

const subscribeDependency = (
  dependency: Dependency,
  listener: () => void
): Unsubscribe => {
  if (dependency.key === NO_KEY) {
    const store = dependency.store as ReadStore<unknown> & InternalReadSubscription<unknown>
    return store[INTERNAL_SUBSCRIBE]?.(listener)
      ?? store.subscribe(listener)
  }

  const store = dependency.store as KeyedReadStore<unknown, unknown> & InternalKeyedReadSubscription<unknown, unknown>
  return store[INTERNAL_KEYED_SUBSCRIBE]?.(dependency.key, listener)
    ?? store.subscribe(dependency.key, listener)
}

export const collectDependencies = <T,>(
  token: object,
  compute: () => T
): {
  value: T
  dependencies: readonly Dependency[]
} => {
  const dependencies: Dependency[] = []
  const seenByStore = new WeakMap<object, Set<unknown>>()
  const frame = beginComputation(token, (store, key) => {
    const storeKey = store as object
    const seenKeys = seenByStore.get(storeKey) ?? new Set<unknown>()
    if (!seenByStore.has(storeKey)) {
      seenByStore.set(storeKey, seenKeys)
    }
    if (seenKeys.has(key)) {
      return
    }

    seenKeys.add(key)
    dependencies.push({
      store: store as ReadStore<unknown> | KeyedReadStore<unknown, unknown>,
      key
    })
  })

  try {
    return {
      value: compute(),
      dependencies
    }
  } finally {
    endComputation(frame)
  }
}

export const reconcileDependencies = (input: {
  previous: readonly DependencyRecord[]
  next: readonly Dependency[]
  subscribe: (dependency: Dependency) => Unsubscribe
}): readonly DependencyRecord[] => {
  if (sameDependencySequence(input.previous, input.next)) {
    return input.previous
  }

  const previousMap = createDependencyRecordMap(input.previous)
  const nextRecords = input.next.map(dependency => {
    const reused = previousMap.take(dependency)
    if (reused) {
      return reused
    }

    return {
      ...dependency,
      unsubscribe: input.subscribe(dependency)
    }
  })

  previousMap.leftovers().forEach(dependency => {
    dependency.unsubscribe()
  })

  return nextRecords
}

export const subscribeTrackedDependency = (
  dependency: Dependency,
  listener: () => void
): Unsubscribe => subscribeDependency(dependency, listener)
