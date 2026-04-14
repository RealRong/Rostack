import type { Equality } from '@shared/core/equality'
import { createRafTask } from '@shared/core/scheduler'

export type Listener = () => void
export type Unsubscribe = () => void

export interface ReadStore<T> {
  get(): T
  subscribe(listener: Listener): Unsubscribe
  isEqual?: Equality<T>
}

export interface KeyedReadStore<K, T> {
  get(key: K): T
  subscribe(key: K, listener: Listener): Unsubscribe
  isEqual?: Equality<T>
}

export interface ValueStore<T> extends ReadStore<T> {
  set(next: T): void
  update(recipe: (previous: T) => T): void
}

export type KeyedStorePatch<Key, T> = {
  set?: Iterable<readonly [Key, T]>
  delete?: Iterable<Key>
}

export interface KeyedStore<Key, T> extends KeyedReadStore<Key, T> {
  all(): ReadonlyMap<Key, T>
  set(key: Key, value: T): void
  delete(key: Key): void
  patch(nextPatch: KeyedStorePatch<Key, T>): void
  clear(): void
}

export type StoreSchedule = 'sync' | 'microtask' | 'raf'

export interface StagedValueStore<T> extends ReadStore<T> {
  write(next: T): void
  clear(): void
  flush(): void
}

export interface StagedKeyedStore<Key, T, Input> extends KeyedReadStore<Key, T> {
  all(): ReadonlyMap<Key, T>
  write(next: Input): void
  clear(): void
  flush(): void
}

interface StoreRead {
  <T>(store: ReadStore<T>): T
  <K, T>(store: KeyedReadStore<K, T>, key: K): T
}

interface Dependency {
  store: ReadStore<unknown> | KeyedReadStore<unknown, unknown>
  key?: unknown
}

const sameDependency = (
  left: Dependency,
  right: Dependency
) => left.store === right.store && Object.is(left.key, right.key)

const sameDependencies = (
  left: readonly Dependency[],
  right: readonly Dependency[]
) => (
  left.length === right.length
  && left.every(item => right.some(candidate => sameDependency(item, candidate)))
)

const pushDependency = (
  dependencies: Dependency[],
  next: Dependency
) => {
  if (dependencies.some(current => sameDependency(current, next))) {
    return
  }

  dependencies.push(next)
}

const createTrackedRead = (
  dependencies: Dependency[]
): StoreRead => ((store: ReadStore<unknown> | KeyedReadStore<unknown, unknown>, ...args: [unknown?]) => {
  if (args.length === 0) {
    pushDependency(dependencies, { store })
    return runWithPlainGetAccess(() => (store as ReadStore<unknown>).get())
  }

  const [key] = args
  pushDependency(dependencies, { store, key })
  return runWithPlainGetAccess(() => (store as KeyedReadStore<unknown, unknown>).get(key))
}) as StoreRead

const peekStore = ((store: ReadStore<unknown> | KeyedReadStore<unknown, unknown>, ...args: [unknown?]) => {
  if (args.length === 0) {
    return runWithPlainGetAccess(() => (store as ReadStore<unknown>).get())
  }

  const [key] = args
  return runWithPlainGetAccess(() => (store as KeyedReadStore<unknown, unknown>).get(key))
}) as StoreRead

let activeReadScope: StoreRead | null = null
let plainGetAccessDepth = 0

const runWithReadScope = <T,>(
  scope: StoreRead,
  fn: () => T
): T => {
  const previous = activeReadScope
  activeReadScope = scope

  try {
    return fn()
  } finally {
    activeReadScope = previous
  }
}

const runWithPlainGetAccess = <T,>(
  fn: () => T
): T => {
  plainGetAccessDepth += 1

  try {
    return fn()
  } finally {
    plainGetAccessDepth -= 1
  }
}

const assertPlainGetAllowed = () => {
  if (activeReadScope === null || plainGetAccessDepth > 0) {
    return
  }

  throw new Error(
    'Do not call store.get() inside a derived computation. Use read(store) instead.'
  )
}

const guardPlainGet = <T,>(
  get: () => T
) => () => {
  assertPlainGetAllowed()
  return get()
}

const guardPlainKeyedGet = <K, T>(
  get: (key: K) => T
) => (key: K) => {
  assertPlainGetAllowed()
  return get(key)
}

export function peek<T>(
  store: ReadStore<T>
): T
export function peek<K, T>(
  store: KeyedReadStore<K, T>,
  key: K
): T
export function peek<K, T>(
  store: ReadStore<T> | KeyedReadStore<K, T>,
  key?: K
): T {
  return key === undefined
    ? peekStore(store as ReadStore<T>)
    : peekStore(store as KeyedReadStore<K, T>, key)
}

export function read<T>(
  store: ReadStore<T>
): T
export function read<K, T>(
  store: KeyedReadStore<K, T>,
  key: K
): T
export function read<K, T>(
  store: ReadStore<T> | KeyedReadStore<K, T>,
  key?: K
): T {
  const current = activeReadScope ?? peekStore

  return key === undefined
    ? current(store as ReadStore<T>)
    : current(store as KeyedReadStore<K, T>, key)
}

const subscribeDependency = (
  dependency: Dependency,
  listener: Listener
): Unsubscribe => dependency.key === undefined
  ? (dependency.store as ReadStore<unknown>).subscribe(listener)
  : (dependency.store as KeyedReadStore<unknown, unknown>).subscribe(dependency.key, listener)

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

const notifyListeners = (
  listeners: ReadonlySet<Listener>
) => {
  Array.from(listeners).forEach(listener => {
    listener()
  })
}

const collectChangedKeys = <Key,>(
  previous: ReadonlyMap<Key, unknown>,
  next: ReadonlyMap<Key, unknown>
) => new Set<Key>([
  ...previous.keys(),
  ...next.keys()
])

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

export const joinUnsubscribes = (
  unsubscribes: readonly Unsubscribe[]
): Unsubscribe => () => {
  unsubscribes.forEach(unsubscribe => unsubscribe())
}

export const createReadStore = <T,>(
  options: {
    get: () => T
    subscribe: (listener: Listener) => Unsubscribe
    isEqual?: Equality<T>
  }
): ReadStore<T> => ({
  get: guardPlainGet(options.get),
  subscribe: options.subscribe,
  ...(options.isEqual ? { isEqual: options.isEqual } : {})
})

export const createKeyedReadStore = <K, T>(
  options: {
    get: (key: K) => T
    subscribe: (key: K, listener: Listener) => Unsubscribe
    isEqual?: Equality<T>
  }
): KeyedReadStore<K, T> => ({
  get: guardPlainKeyedGet(options.get),
  subscribe: options.subscribe,
  ...(options.isEqual ? { isEqual: options.isEqual } : {})
})

export function createValueStore<T>(
  options: {
    initial: T
    isEqual?: Equality<T>
  }
): ValueStore<T>
export function createValueStore<T>(
  initial: T,
  options?: {
    isEqual?: Equality<T>
  }
): ValueStore<T>
export function createValueStore<T>(
  initialOrOptions: T | {
    initial: T
    isEqual?: Equality<T>
  },
  maybeOptions?: {
    isEqual?: Equality<T>
  }
): ValueStore<T> {
  const initial = (
    typeof initialOrOptions === 'object'
    && initialOrOptions !== null
    && 'initial' in initialOrOptions
  )
    ? initialOrOptions.initial
    : initialOrOptions as T
  const isEqual = (
    typeof initialOrOptions === 'object'
    && initialOrOptions !== null
    && 'initial' in initialOrOptions
      ? initialOrOptions.isEqual
      : maybeOptions?.isEqual
  ) ?? sameValue

  let current = initial
  const listeners = new Set<Listener>()

  const set = (next: T) => {
    if (isEqual(current, next)) {
      return
    }

    current = next
    notifyListeners(listeners)
  }

  return {
    get: guardPlainGet(() => current),
    set,
    update: recipe => set(recipe(current)),
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isEqual
  }
}

export const createDerivedStore = <T,>(
  options: {
    get: () => T
    isEqual?: Equality<T>
  }
): ReadStore<T> => {
  const isEqual = options.isEqual ?? sameValue
  const listeners = new Set<Listener>()
  let current: T | undefined
  let hasCurrent = false
  let computing = false
  let dependencies: readonly Dependency[] = []
  let unsubscribeDependencies: Unsubscribe = () => {}

  const recompute = (notify: boolean) => {
    if (computing) {
      throw new Error('Circular derived store dependency detected.')
    }

    computing = true
    try {
      const nextDependencies: Dependency[] = []
      const nextValue = runWithReadScope(
        createTrackedRead(nextDependencies),
        options.get
      )

      if (!sameDependencies(dependencies, nextDependencies)) {
        unsubscribeDependencies()
        dependencies = nextDependencies
        unsubscribeDependencies = joinUnsubscribes(
          nextDependencies.map(dependency => subscribeDependency(dependency, () => {
            recompute(true)
          }))
        )
      }

      if (!hasCurrent || !isEqual(current as T, nextValue)) {
        current = nextValue
        hasCurrent = true
        if (notify) {
          notifyListeners(listeners)
        }
        return
      }

      current = nextValue
      hasCurrent = true
    } finally {
      computing = false
    }
  }

  return {
    get: guardPlainGet(() => {
      if (!hasCurrent) {
        recompute(false)
      }

      return current as T
    }),
    subscribe: listener => {
      listeners.add(listener)
      if (listeners.size === 1) {
        recompute(false)
      }

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          unsubscribeDependencies()
          unsubscribeDependencies = () => {}
          dependencies = []
        }
      }
    },
    isEqual
  }
}

export const createKeyedDerivedStore = <K, T>(
  options: {
    get: (key: K) => T
    isEqual?: Equality<T>
    keyOf?: (key: K) => unknown
  }
): KeyedReadStore<K, T> => {
  const cache = new Map<unknown, ReadStore<T>>()
  const resolveStore = (key: K): ReadStore<T> => {
    const cacheKey = options.keyOf ? options.keyOf(key) : key
    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const store = createDerivedStore({
      get: () => options.get(key),
      ...(options.isEqual ? { isEqual: options.isEqual } : {})
    })
    cache.set(cacheKey, store)
    return store
  }

  return {
    get: guardPlainKeyedGet((key: K) => resolveStore(key).get()),
    subscribe: (key, listener) => resolveStore(key).subscribe(listener),
    ...(options.isEqual ? { isEqual: options.isEqual } : {})
  }
}

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
  const listenersByKey = new Map<Key, Set<Listener>>()

  const notifyKey = (key: Key) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }

    notifyListeners(listeners)
  }

  const readCurrent = (key: Key) => current.has(key)
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
    get: guardPlainKeyedGet((key: Key) => readCurrent(key)),
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

      changedKeys.forEach(key => {
        const previousValue = previous.get(key) ?? emptyValue
        if (isEqual(previousValue, emptyValue)) {
          return
        }

        notifyKey(key)
      })
    },
    isEqual
  }
}

const NO_PENDING = Symbol('no-pending')
const CLEAR_PENDING = Symbol('clear-pending')

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
  let current: Value | undefined
  let hasValue = false
  let tracking = false
  let pendingSource: Source | undefined
  let hasPending = false
  let unsubscribeSource = () => {}
  const listeners = new Set<Listener>()

  const commit = (
    next: Value
  ) => {
    if (hasValue && isEqual(current as Value, next)) {
      return
    }

    current = next
    hasValue = true
    notifyListeners(listeners)
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

  const refresh = () => {
    const next = select(peek(source))
    if (!hasValue || !isEqual(current as Value, next)) {
      current = next
    }
    hasValue = true
  }

  const handleSourceChange = () => {
    if (schedule === 'sync') {
      commit(select(peek(source)))
      return
    }

    pendingSource = peek(source)
    hasPending = true
    task.schedule()
  }

  return {
    get: guardPlainGet(() => {
      refresh()
      return current as Value
    }),
    subscribe: listener => {
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
    },
    isEqual
  }
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
  let current = new Map<Key, Value>() as ReadonlyMap<Key, Value>
  let tracking = false
  let pendingSource: Source | undefined
  let hasPending = false
  let unsubscribeSource = () => {}
  const listenersByKey = new Map<Key, Set<Listener>>()

  const notifyKey = (
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

    collectChangedKeys(previous, next).forEach(key => {
      const previousValue = previous.get(key) ?? emptyValue
      const nextValue = next.get(key) ?? emptyValue
      if (isEqual(previousValue, nextValue)) {
        return
      }

      notifyKey(key)
    })
  }

  const refresh = () => {
    current = select(peek(source))
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
      commit(select(peek(source)))
      return
    }

    pendingSource = peek(source)
    hasPending = true
    task.schedule()
  }

  return {
    get: guardPlainKeyedGet((key: Key) => {
      if (!tracking) {
        return select(peek(source)).get(key) ?? emptyValue
      }

      return current.get(key) ?? emptyValue
    }),
    subscribe: (key, listener) => {
      const listeners = listenersByKey.get(key) ?? new Set<Listener>()
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
        if (currentListeners.size > 0) {
          return
        }

        listenersByKey.delete(key)
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
    },
    isEqual
  }
}

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
  const listeners = new Set<Listener>()

  return {
    get: guardPlainGet(() => current),
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
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
      notifyListeners(listeners)
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
      notifyListeners(listeners)
    },
    isEqual
  }
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
  const listenersByKey = new Map<Key, Set<Listener>>()

  const notifyKey = (key: Key) => {
    const listeners = listenersByKey.get(key)
    if (!listeners?.size) {
      return
    }

    notifyListeners(listeners)
  }

  const commit = (next: ReadonlyMap<Key, Value>) => {
    const previous = current
    if (previous === next) {
      return
    }

    current = next

    collectChangedKeys(previous, next).forEach(key => {
      const previousValue = previous.get(key) ?? emptyValue
      const nextValue = next.get(key) ?? emptyValue
      if (isEqual(previousValue, nextValue)) {
        return
      }

      notifyKey(key)
    })
  }

  return {
    get: guardPlainKeyedGet((key: Key) => current.get(key) ?? emptyValue),
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
  }
}

type RafFallback = 'microtask' | 'sync'

export const createRafValueStore = <T,>({
  initial,
  isEqual,
  fallback = 'microtask'
}: {
  initial: T
  isEqual?: Equality<T>
  fallback?: RafFallback
}): StagedValueStore<T> => {
  let schedule = () => {}

  const store = createStagedValueStore<T>({
    schedule: () => {
      schedule()
    },
    initial,
    isEqual
  })

  const task = createRafTask(() => {
    store.flush()
  }, { fallback })

  schedule = task.schedule

  return {
    get: store.get,
    subscribe: store.subscribe,
    write: store.write,
    clear: () => {
      task.cancel()
      store.clear()
    },
    flush: store.flush,
    isEqual: store.isEqual
  }
}

export const createRafKeyedStore = <Key, Value, Input>({
  emptyState,
  emptyValue,
  build,
  isEqual,
  fallback = 'microtask'
}: {
  emptyState: ReadonlyMap<Key, Value>
  emptyValue: Value
  build: (input: Input) => ReadonlyMap<Key, Value>
  isEqual?: Equality<Value>
  fallback?: RafFallback
}): StagedKeyedStore<Key, Value, Input> => {
  let schedule = () => {}

  const store = createStagedKeyedStore<Key, Value, Input>({
    schedule: () => {
      schedule()
    },
    emptyState,
    emptyValue,
    build,
    isEqual
  })

  const task = createRafTask(() => {
    store.flush()
  }, { fallback })

  schedule = task.schedule

  return {
    get: store.get,
    all: store.all,
    subscribe: store.subscribe,
    write: store.write,
    clear: () => {
      task.cancel()
      store.clear()
    },
    flush: store.flush,
    isEqual: store.isEqual
  }
}
