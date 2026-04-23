import type { Equality } from '../equality'

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

export interface KeyTablePatch<Key, Value> {
  set?: readonly (readonly [Key, Value])[]
  remove?: readonly Key[]
}

export interface KeyTableReadStore<Key, Value> {
  read: {
    get: (key: Key) => Value | undefined
    has: (key: Key) => boolean
    all: () => ReadonlyMap<Key, Value>
    size: () => number
  }
  subscribe: {
    key: (key: Key, listener: Listener) => Unsubscribe
  }
}

export interface KeyTableStore<Key, Value> extends KeyTableReadStore<Key, Value> {
  write: {
    replace: (next: ReadonlyMap<Key, Value>) => void
    apply: (patch: KeyTablePatch<Key, Value>) => void
    applyExact: (patch: KeyTablePatch<Key, Value>) => void
    clear: () => void
  }
  project: {
    field: <Projected>(
      select: (value: Value | undefined) => Projected,
      isEqual?: Equality<Projected>
    ) => KeyedReadStore<Key, Projected>
  }
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

export type StoreSchedule = 'sync' | 'microtask' | 'frame'

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
