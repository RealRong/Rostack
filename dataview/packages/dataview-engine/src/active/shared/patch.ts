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

  return overlay as ReadonlyMap<K, V>
}

export const createMapPatchBuilder = <K, V>(
  previous: ReadonlyMap<K, V>
): MapPatchBuilder<K, V> => {
  let next: Map<K, V> | undefined

  const current = () => next ?? previous
  const ensure = () => {
    if (!next) {
      next = new Map(previous)
    }

    return next
  }

  return {
    get: key => current().get(key),
    has: key => current().has(key),
    set: (key, value) => {
      if (current().get(key) === value && current().has(key)) {
        return
      }

      ensure().set(key, value)
    },
    delete: key => {
      if (!current().has(key)) {
        return
      }

      ensure().delete(key)
    },
    changed: () => next !== undefined,
    finish: () => next ?? previous
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
