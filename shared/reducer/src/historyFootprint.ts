export interface HistoryFootprintCollector<TKey> {
  add(key: TKey): void
  addMany(keys: Iterable<TKey>): void
  has(key: TKey): boolean
  finish(): readonly TKey[]
  clear(): void
}

export const createHistoryFootprintCollector = <TKey>(
  serialize: (key: TKey) => string
): HistoryFootprintCollector<TKey> => {
  const byKey = new Map<string, TKey>()

  const add = (key: TKey) => {
    byKey.set(serialize(key), key)
  }

  return {
    add,
    addMany: (keys) => {
      for (const key of keys) {
        add(key)
      }
    },
    has: key => byKey.has(serialize(key)),
    finish: () => [...byKey.values()],
    clear: () => {
      byKey.clear()
    }
  }
}

export const assertHistoryFootprint = <TKey>(
  value: unknown,
  isKey: (value: unknown) => value is TKey,
  options: {
    invalidCollectionMessage?: string
    invalidKeyMessage?: string
  } = {}
): readonly TKey[] => {
  if (!Array.isArray(value)) {
    throw new Error(
      options.invalidCollectionMessage
      ?? 'History footprint must be an array.'
    )
  }

  value.forEach((entry) => {
    if (!isKey(entry)) {
      throw new Error(
        options.invalidKeyMessage
        ?? 'History footprint entry is invalid.'
      )
    }
  })

  return value
}

export const historyFootprintConflicts = <TKey>(
  left: readonly TKey[],
  right: readonly TKey[],
  conflicts: (left: TKey, right: TKey) => boolean
): boolean => {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (conflicts(left[leftIndex]!, right[rightIndex]!)) {
        return true
      }
    }
  }

  return false
}
