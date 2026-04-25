export interface MapDraft<K, V> {
  get(key: K): V | undefined
  has(key: K): boolean
  set(key: K, value: V): void
  delete(key: K): void
  changed(): boolean
  finish(): ReadonlyMap<K, V>
}

export interface ArrayDraft<T> {
  read(): readonly T[]
  mutate(fn: (draft: T[]) => void): void
  changed(): boolean
  finish(): readonly T[]
}

const MAP_OVERLAY_DEPTH = new WeakMap<object, number>()
const MAX_MAP_OVERLAY_DEPTH = 8
const MIN_LARGE_MAP_DELTA = 128

class OverlayMap<K, V> implements ReadonlyMap<K, V> {
  private cachedSize: number | undefined

  constructor(
    private readonly previous: ReadonlyMap<K, V>,
    private readonly updated: ReadonlyMap<K, V> | undefined,
    private readonly removed: ReadonlySet<K> | undefined,
    depth: number
  ) {
    MAP_OVERLAY_DEPTH.set(this, depth)
  }

  get size(): number {
    if (this.cachedSize !== undefined) {
      return this.cachedSize
    }

    let size = this.previous.size
    this.removed?.forEach(key => {
      if (this.previous.has(key) && !this.updated?.has(key)) {
        size -= 1
      }
    })
    this.updated?.forEach((_value, key) => {
      if (!this.previous.has(key)) {
        size += 1
      }
    })
    this.cachedSize = size
    return size
  }

  get(key: K): V | undefined {
    if (this.updated?.has(key)) {
      return this.updated.get(key)
    }
    if (this.removed?.has(key)) {
      return undefined
    }

    return this.previous.get(key)
  }

  has(key: K): boolean {
    return this.updated?.has(key)
      ? true
      : this.removed?.has(key)
        ? false
        : this.previous.has(key)
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.iterateEntries()) {
      callbackfn.call(thisArg, value, key, this)
    }
  }

  private *iterateEntries(): IterableIterator<[K, V]> {
    const emitted = new Set<K>()

    for (const [key, value] of this.previous) {
      if (this.removed?.has(key)) {
        continue
      }

      if (this.updated?.has(key)) {
        emitted.add(key)
        yield [key, this.updated.get(key)!]
        continue
      }

      yield [key, value]
    }

    if (!this.updated?.size) {
      return
    }

    for (const [key, value] of this.updated) {
      if (emitted.has(key) || this.previous.has(key)) {
        continue
      }

      yield [key, value]
    }
  }

  entries(): MapIterator<[K, V]> {
    return new Map(this.iterateEntries()).entries()
  }

  keys(): MapIterator<K> {
    return new Map(this.iterateEntries()).keys()
  }

  values(): MapIterator<V> {
    return new Map(this.iterateEntries()).values()
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }

  readonly [Symbol.toStringTag] = 'Map'
}

const readOverlayDepth = (
  value: unknown
): number => (
  typeof value === 'object'
  && value !== null
    ? MAP_OVERLAY_DEPTH.get(value as object) ?? 0
    : 0
)

export const createMapOverlay = <K, V>(input: {
  previous: ReadonlyMap<K, V>
  set?: ReadonlyMap<K, V>
  delete?: ReadonlySet<K>
}): ReadonlyMap<K, V> => {
  const updated = input.set
  const removed = input.delete
  if (!updated?.size && !removed?.size) {
    return input.previous
  }

  const nextDepth = readOverlayDepth(input.previous) + 1
  const deltaSize = (updated?.size ?? 0) + (removed?.size ?? 0)
  if (
    nextDepth >= MAX_MAP_OVERLAY_DEPTH
    || (
      deltaSize >= MIN_LARGE_MAP_DELTA
      && deltaSize * 2 > input.previous.size
    )
  ) {
    return new Map(new OverlayMap(input.previous, updated, removed, nextDepth))
  }

  return new OverlayMap(input.previous, updated, removed, nextDepth)
}

export const createMapDraft = <K, V>(
  previous: ReadonlyMap<K, V>
): MapDraft<K, V> => {
  let updated: Map<K, V> | undefined
  let removed: Set<K> | undefined

  const cleanup = () => {
    if (!updated?.size) {
      updated = undefined
    }
    if (!removed?.size) {
      removed = undefined
    }
  }

  const hasCurrent = (key: K) => updated?.has(key)
    ? true
    : removed?.has(key)
      ? false
      : previous.has(key)

  const getCurrent = (key: K) => updated?.has(key)
    ? updated.get(key)
    : removed?.has(key)
      ? undefined
      : previous.get(key)

  return {
    get: getCurrent,
    has: hasCurrent,
    set: (key, value) => {
      if (previous.has(key) && previous.get(key) === value) {
        updated?.delete(key)
        removed?.delete(key)
        cleanup()
        return
      }

      if (updated?.has(key) && updated.get(key) === value && !removed?.has(key)) {
        return
      }

      removed?.delete(key)
      updated ??= new Map()
      updated.set(key, value)
      cleanup()
    },
    delete: key => {
      if (removed?.has(key)) {
        return
      }

      if (updated?.has(key)) {
        updated.delete(key)
      }

      if (!previous.has(key)) {
        cleanup()
        return
      }

      removed ??= new Set()
      removed.add(key)
      cleanup()
    },
    changed: () => Boolean(updated?.size || removed?.size),
    finish: () => (
      updated?.size || removed?.size
        ? createMapOverlay({
            previous,
            ...(updated?.size ? { set: updated } : {}),
            ...(removed?.size ? { delete: removed } : {})
          })
        : previous
    )
  }
}

export const createArrayDraft = <T>(
  previous: readonly T[]
): ArrayDraft<T> => {
  let next: T[] | undefined

  const ensure = () => {
    if (!next) {
      next = [...previous]
    }

    return next
  }

  return {
    read: () => next ?? previous,
    mutate: fn => {
      fn(ensure())
    },
    changed: () => next !== undefined,
    finish: () => next ?? previous
  }
}
