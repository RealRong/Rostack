export type Listener = () => void
export type Unsubscribe = () => void

export type Equality<T> = (left: T, right: T) => boolean

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

export interface StoreRead {
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
) => left.length === right.length && left.every((item, index) => sameDependency(item, right[index]))

const pushDependency = (
  dependencies: Dependency[],
  next: Dependency
) => {
  if (dependencies.some(current => sameDependency(current, next))) {
    return
  }

  dependencies.push(next)
}

const createTrackedRead = (dependencies: Dependency[]): StoreRead => ((store: ReadStore<unknown> | KeyedReadStore<unknown, unknown>, ...args: [unknown?]) => {
  if (args.length === 0) {
    pushDependency(dependencies, { store })
    return (store as ReadStore<unknown>).get()
  }

  const [key] = args
  pushDependency(dependencies, { store, key })
  return (store as KeyedReadStore<unknown, unknown>).get(key)
}) as StoreRead

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
  get: options.get,
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
  get: options.get,
  subscribe: options.subscribe,
  ...(options.isEqual ? { isEqual: options.isEqual } : {})
})

export const createValueStore = <T,>(
  options: {
    initial: T
    isEqual?: Equality<T>
  }
): ValueStore<T> => {
  const isEqual = options.isEqual ?? sameValue
  let current = options.initial
  const listeners = new Set<Listener>()

  const notify = () => {
    listeners.forEach(listener => listener())
  }

  const set = (next: T) => {
    if (isEqual(current, next)) {
      return
    }

    current = next
    notify()
  }

  return {
    get: () => current,
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
    get: (read: StoreRead) => T
    isEqual?: Equality<T>
  }
): ReadStore<T> => {
  const isEqual = options.isEqual ?? sameValue
  const listeners = new Set<Listener>()
  let current: T | undefined
  let hasCurrent = false
  let dependencies: readonly Dependency[] = []
  let unsubscribeDependencies: Unsubscribe = () => {}

  const recompute = (notify: boolean) => {
    const nextDependencies: Dependency[] = []
    const nextValue = options.get(createTrackedRead(nextDependencies))

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
        listeners.forEach(listener => listener())
      }
      return
    }

    current = nextValue
    hasCurrent = true
  }

  return {
    get: () => {
      if (!hasCurrent) {
        recompute(false)
      }

      return current as T
    },
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
    get: (read: StoreRead, key: K) => T
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
      get: read => options.get(read, key),
      ...(options.isEqual ? { isEqual: options.isEqual } : {})
    })
    cache.set(cacheKey, store)
    return store
  }

  return {
    get: key => resolveStore(key).get(),
    subscribe: (key, listener) => resolveStore(key).subscribe(listener),
    ...(options.isEqual ? { isEqual: options.isEqual } : {})
  }
}
