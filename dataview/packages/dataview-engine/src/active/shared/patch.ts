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
