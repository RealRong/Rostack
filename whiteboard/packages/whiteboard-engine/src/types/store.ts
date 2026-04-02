export type ReadStore<T> = {
  get: () => T
  subscribe: (listener: () => void) => () => void
}

export type KeyedReadStore<Key, T> = {
  get: (key: Key) => T
  subscribe: (key: Key, listener: () => void) => () => void
}

export type KeyedStorePatch<Key, T> = {
  set?: Iterable<readonly [Key, T]>
  delete?: Iterable<Key>
}

export type KeyedStore<Key, T> = KeyedReadStore<Key, T> & {
  all: () => ReadonlyMap<Key, T>
  set: (key: Key, value: T) => void
  delete: (key: Key) => void
  patch: (patch: KeyedStorePatch<Key, T>) => void
  clear: () => void
}

export type ValueStore<T> = ReadStore<T> & {
  set: (next: T) => void
  update: (recipe: (prev: T) => T) => void
}

export type StagedValueStore<T> = ReadStore<T> & {
  write: (next: T) => void
  clear: () => void
  flush: () => void
}

export type StagedKeyedStore<Key, T, Input> = KeyedReadStore<Key, T> & {
  all: () => ReadonlyMap<Key, T>
  write: (next: Input) => void
  clear: () => void
  flush: () => void
}

export type ReadFn = {
  <T>(store: ReadStore<T>): T
  <Key, T>(store: KeyedReadStore<Key, T>, key: Key): T
}
