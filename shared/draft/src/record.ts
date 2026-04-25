const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export interface DraftRecord<Id extends string, Value> {
  readonly base: Record<Id, Value>

  get(id: Id): Value | undefined
  has(id: Id): boolean

  set(id: Id, value: Value): void
  delete(id: Id): void

  keys(): IterableIterator<Id>
  entries(): IterableIterator<[Id, Value]>
  values(): IterableIterator<Value>

  changed(): boolean
  finish(): Record<Id, Value>
}

export const record = <Id extends string, Value>(
  base: Record<Id, Value>
): DraftRecord<Id, Value> => {
  let current: Record<Id, Value> | undefined

  const finishCurrent = (): Record<Id, Value> => {
    if (!current) {
      return base
    }

    const currentKeys = Object.keys(current) as Id[]
    const baseKeys = Object.keys(base) as Id[]
    if (currentKeys.length !== baseKeys.length) {
      return current
    }

    for (const key of currentKeys) {
      if (!hasOwn(base, key) || !Object.is(current[key], base[key])) {
        return current
      }
    }

    return base
  }

  const readCurrent = (): Record<Id, Value> => current ?? base
  const ensureCurrent = (): Record<Id, Value> => {
    if (!current) {
      current = {
        ...base
      }
    }

    return current
  }

  return {
    base,
    get: (id) => readCurrent()[id],
    has: (id) => hasOwn(readCurrent(), id),
    set: (id, value) => {
      const source = readCurrent()
      if (hasOwn(source, id) && Object.is(source[id], value)) {
        return
      }

      ensureCurrent()[id] = value
    },
    delete: (id) => {
      const source = readCurrent()
      if (!hasOwn(source, id)) {
        return
      }

      delete ensureCurrent()[id]
    },
    keys: function keys() {
      const source = readCurrent()
      return (function * iterate(): IterableIterator<Id> {
        for (const key of Object.keys(source) as Id[]) {
          yield key
        }
      })()
    },
    entries: function entries() {
      const source = readCurrent()
      return (function * iterate(): IterableIterator<[Id, Value]> {
        for (const key of Object.keys(source) as Id[]) {
          yield [key, source[key]!]
        }
      })()
    },
    values: function values() {
      const source = readCurrent()
      return (function * iterate(): IterableIterator<Value> {
        for (const key of Object.keys(source) as Id[]) {
          yield source[key]!
        }
      })()
    },
    changed: () => finishCurrent() !== base,
    finish: () => finishCurrent()
  }
}
