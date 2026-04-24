export type KeySet<TKey> =
  | {
      kind: 'none'
    }
  | {
      kind: 'all'
    }
  | {
      kind: 'some'
      keys: ReadonlySet<TKey>
    }

const EMPTY_NONE = {
  kind: 'none'
} as const satisfies KeySet<never>

const ALL_KEYS = {
  kind: 'all'
} as const satisfies KeySet<never>

const toArray = <TKey>(
  values: Iterable<TKey>
): TKey[] => Array.from(values)

export const none = <TKey,>(): KeySet<TKey> => EMPTY_NONE as KeySet<TKey>

export const all = <TKey,>(): KeySet<TKey> => ALL_KEYS as KeySet<TKey>

export const some = <TKey>(
  keys: Iterable<TKey>
): KeySet<TKey> => {
  const next = new Set(keys)
  return next.size > 0
    ? {
        kind: 'some',
        keys: next
      }
    : none<TKey>()
}

export const clone = <TKey>(
  set: KeySet<TKey>
): KeySet<TKey> => {
  if (set.kind === 'none') {
    return none<TKey>()
  }
  if (set.kind === 'all') {
    return all<TKey>()
  }
  return some(set.keys)
}

export const isEmpty = <TKey>(
  set: KeySet<TKey>
): boolean => set.kind === 'none'

export const has = <TKey>(
  set: KeySet<TKey>,
  key: TKey
): boolean => {
  if (set.kind === 'all') {
    return true
  }
  if (set.kind === 'none') {
    return false
  }
  return set.keys.has(key)
}

export const add = <TKey>(
  set: KeySet<TKey>,
  key: TKey
): KeySet<TKey> => {
  if (set.kind === 'all') {
    return set
  }

  const next = set.kind === 'some'
    ? new Set(set.keys)
    : new Set<TKey>()
  next.add(key)
  return some(next)
}

export const addMany = <TKey>(
  set: KeySet<TKey>,
  keys: Iterable<TKey>
): KeySet<TKey> => {
  if (set.kind === 'all') {
    return set
  }

  const next = set.kind === 'some'
    ? new Set(set.keys)
    : new Set<TKey>()

  for (const key of keys) {
    next.add(key)
  }

  return some(next)
}

export const union = <TKey>(
  ...sets: readonly KeySet<TKey>[]
): KeySet<TKey> => {
  const merged = new Set<TKey>()

  for (const set of sets) {
    if (set.kind === 'all') {
      return all<TKey>()
    }
    if (set.kind === 'some') {
      set.keys.forEach((key) => {
        merged.add(key)
      })
    }
  }

  return some(merged)
}

export const subtract = <TKey>(
  set: KeySet<TKey>,
  keys: Iterable<TKey>,
  allKeys?: readonly TKey[]
): KeySet<TKey> => {
  const removed = new Set(keys)
  if (removed.size === 0) {
    return set
  }

  if (set.kind === 'none') {
    return set
  }

  if (set.kind === 'all') {
    if (!allKeys) {
      throw new Error('Cannot subtract from an all key set without allKeys.')
    }

    return some(allKeys.filter((key) => !removed.has(key)))
  }

  const next = new Set(set.keys)
  removed.forEach((key) => {
    next.delete(key)
  })
  return some(next)
}

export const intersects = <TKey>(
  left: KeySet<TKey>,
  right: KeySet<TKey>
): boolean => {
  if (left.kind === 'none' || right.kind === 'none') {
    return false
  }

  if (left.kind === 'all' || right.kind === 'all') {
    return true
  }

  const scan = left.keys.size <= right.keys.size
    ? left.keys
    : right.keys
  const match = scan === left.keys
    ? right.keys
    : left.keys

  for (const key of scan) {
    if (match.has(key)) {
      return true
    }
  }

  return false
}

export const materialize = <TKey>(
  set: KeySet<TKey>,
  allKeys: readonly TKey[]
): readonly TKey[] => {
  if (set.kind === 'none') {
    return []
  }
  if (set.kind === 'all') {
    return allKeys
  }
  return toArray(set.keys)
}

export const keySet = {
  none,
  all,
  some,
  clone,
  isEmpty,
  has,
  add,
  addMany,
  union,
  subtract,
  intersects,
  materialize
} as const
