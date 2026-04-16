export interface MapPatchBuilder<K, V> {
  get(key: K): V | undefined
  has(key: K): boolean
  set(key: K, value: V): void
  delete(key: K): void
  changed(): boolean
  finish(): ReadonlyMap<K, V>
}

export interface ArrayPatchBuilder<T> {
  read(): readonly T[]
  mutate(fn: (draft: T[]) => void): void
  changed(): boolean
  finish(): readonly T[]
}

const MAP_OVERLAY_DEPTH = new WeakMap<object, number>()
const MAX_MAP_OVERLAY_DEPTH = 8
const MIN_LARGE_MAP_DELTA = 128

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

  let cachedSize: number | undefined
  const readSize = () => {
    if (cachedSize !== undefined) {
      return cachedSize
    }

    let size = input.previous.size
    removed?.forEach(key => {
      if (input.previous.has(key) && !updated?.has(key)) {
        size -= 1
      }
    })
    updated?.forEach((_value, key) => {
      if (!input.previous.has(key)) {
        size += 1
      }
    })
    cachedSize = size
    return size
  }

  function* entries(): IterableIterator<[K, V]> {
    const emitted = new Set<K>()

    for (const [key, value] of input.previous) {
      if (removed?.has(key)) {
        continue
      }

      const nextValue = updated?.get(key)
      if (nextValue !== undefined || updated?.has(key)) {
        emitted.add(key)
        yield [key, nextValue as V]
        continue
      }

      yield [key, value]
    }

    if (!updated?.size) {
      return
    }

    for (const [key, value] of updated) {
      if (emitted.has(key) || input.previous.has(key)) {
        continue
      }

      yield [key, value]
    }
  }

  function* keys(): IterableIterator<K> {
    for (const [key] of entries()) {
      yield key
    }
  }

  function* values(): IterableIterator<V> {
    for (const [, value] of entries()) {
      yield value
    }
  }

  const deltaSize = (updated?.size ?? 0) + (removed?.size ?? 0)
  if (
    nextDepth >= MAX_MAP_OVERLAY_DEPTH
    || (
      deltaSize >= MIN_LARGE_MAP_DELTA
      && deltaSize * 2 > input.previous.size
    )
  ) {
    return new Map(entries())
  }

  const overlay = {
    get size() {
      return readSize()
    },
    get: (key: K) => {
      if (updated?.has(key)) {
        return updated.get(key)
      }
      if (removed?.has(key)) {
        return undefined
      }

      return input.previous.get(key)
    },
    has: (key: K) => updated?.has(key)
      ? true
      : removed?.has(key)
        ? false
        : input.previous.has(key),
    forEach: (
      callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown
    ) => {
      for (const [key, value] of entries()) {
        callbackfn.call(thisArg, value, key, overlay as ReadonlyMap<K, V>)
      }
    },
    entries: entries as unknown as ReadonlyMap<K, V>['entries'],
    keys: keys as unknown as ReadonlyMap<K, V>['keys'],
    values: values as unknown as ReadonlyMap<K, V>['values'],
    [Symbol.iterator]: entries as unknown as ReadonlyMap<K, V>[typeof Symbol.iterator]
  }
  MAP_OVERLAY_DEPTH.set(overlay, nextDepth)

  return overlay as ReadonlyMap<K, V>
}

export const createMapPatchBuilder = <K, V>(
  previous: ReadonlyMap<K, V>
): MapPatchBuilder<K, V> => {
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

export const createArrayPatchBuilder = <T>(
  previous: readonly T[]
): ArrayPatchBuilder<T> => {
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
