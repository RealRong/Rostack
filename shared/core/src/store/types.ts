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

export interface TablePatch<Key, Value> {
  set?: readonly (readonly [Key, Value])[]
  remove?: readonly Key[]
}

export interface TableReadStore<Key, Value> {
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

export interface TableStore<Key, Value> extends TableReadStore<Key, Value> {
  write: {
    replace: (next: ReadonlyMap<Key, Value>) => void
    apply: (patch: TablePatch<Key, Value>) => void
    clear: () => void
  }
  project: {
    field: <Projected>(
      select: (value: Value | undefined) => Projected,
      isEqual?: Equality<Projected>
    ) => KeyedReadStore<Key, Projected>
  }
}

export interface StoreFamily<Key, Value> {
  ids: readonly Key[]
  byId: ReadonlyMap<Key, Value>
}

export interface FamilyPatch<Key, Value> {
  ids?: readonly Key[]
  set?: readonly (readonly [Key, Value])[]
  remove?: readonly Key[]
}

export interface FamilyStore<Key, Value> {
  ids: ReadStore<readonly Key[]>
  byId: TableStore<Key, Value>
  read: {
    family: () => StoreFamily<Key, Value>
    get: (key: Key) => Value | undefined
  }
  write: {
    replace: (next: StoreFamily<Key, Value>) => void
    apply: (patch: FamilyPatch<Key, Value>) => void
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
