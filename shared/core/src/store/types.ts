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
