export interface FamilySnapshot<TKey extends string | number, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export interface ReadState<TKey extends string | number, TValue> extends FamilySnapshot<TKey, TValue>, Iterable<readonly [TKey, TValue]> {
  readonly size: number
  get(key: TKey): TValue | undefined
  has(key: TKey): boolean
  keys(): IterableIterator<TKey>
  values(): IterableIterator<TValue>
  entries(): IterableIterator<[TKey, TValue]>
  forEach(
    callbackfn: (value: TValue, key: TKey, map: ReadonlyMap<TKey, TValue>) => void,
    thisArg?: unknown
  ): void
}

export interface MutableState<TKey extends string | number, TValue> extends ReadState<TKey, TValue> {
  byId: Map<TKey, TValue>
  set(key: TKey, value: TValue): this
  delete(key: TKey): boolean
  clear(): void
  replace(snapshot: FamilySnapshot<TKey, TValue>): this
}

const normalizeIds = <TKey extends string | number, TValue>(
  ids: readonly TKey[] | undefined,
  byId: ReadonlyMap<TKey, TValue>
): TKey[] => {
  const next: TKey[] = []
  const seen = new Set<TKey>()

  ids?.forEach((key) => {
    if (seen.has(key) || !byId.has(key)) {
      return
    }

    seen.add(key)
    next.push(key)
  })

  byId.forEach((_value, key) => {
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    next.push(key)
  })

  return next
}

const toOrderedMap = <TKey extends string | number, TValue>(
  snapshot?: FamilySnapshot<TKey, TValue>
): {
  ids: TKey[]
  byId: Map<TKey, TValue>
} => {
  if (!snapshot) {
    return {
      ids: [],
      byId: new Map()
    }
  }

  const ids = normalizeIds(snapshot.ids, snapshot.byId)
  const byId = new Map<TKey, TValue>()
  ids.forEach((key) => {
    const value = snapshot.byId.get(key)
    if (value !== undefined) {
      byId.set(key, value)
    }
  })

  return {
    ids,
    byId
  }
}

export const createMutableState = <TKey extends string | number, TValue>(
  snapshot?: FamilySnapshot<TKey, TValue>
): MutableState<TKey, TValue> => {
  let current = toOrderedMap(snapshot)

  const state: MutableState<TKey, TValue> = {
    get ids() {
      return current.ids
    },
    get byId() {
      return current.byId
    },
    set byId(value: Map<TKey, TValue>) {
      current = toOrderedMap({
        ids: current.ids,
        byId: value
      })
    },
    get size() {
      return current.byId.size
    },
    get(key) {
      return current.byId.get(key)
    },
    has(key) {
      return current.byId.has(key)
    },
    keys() {
      return current.byId.keys()
    },
    values() {
      return current.byId.values()
    },
    entries() {
      return current.byId.entries()
    },
    forEach(callbackfn, thisArg) {
      current.byId.forEach((value, key) => {
        callbackfn.call(thisArg, value, key, current.byId)
      })
    },
    [Symbol.iterator]() {
      return current.byId[Symbol.iterator]()
    },
    set(key, value) {
      if (!current.byId.has(key)) {
        current.ids = [...current.ids, key]
      }
      current.byId.set(key, value)
      return state
    },
    delete(key) {
      if (!current.byId.delete(key)) {
        return false
      }

      current.ids = current.ids.filter((currentKey) => currentKey !== key)
      return true
    },
    clear() {
      if (current.byId.size === 0) {
        return
      }

      current = {
        ids: [],
        byId: new Map()
      }
    },
    replace(next) {
      current = toOrderedMap(next)
      return state
    }
  }

  return state
}
