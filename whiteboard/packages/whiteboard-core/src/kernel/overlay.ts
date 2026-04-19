const TOMBSTONE = Symbol('overlay.tombstone')

type OverlayValue<T> = T | typeof TOMBSTONE

export type OverlayTable<Id extends string, T> = {
  get: (id: Id) => T | undefined
  set: (id: Id, value: T) => void
  delete: (id: Id) => void
  entries: () => IterableIterator<[Id, T]>
  values: () => IterableIterator<T>
  materialize: () => Record<Id, T>
}

export const createOverlayTable = <Id extends string, T>(
  base: Record<Id, T>
): OverlayTable<Id, T> => {
  const overlay = new Map<Id, OverlayValue<T>>()

  const read = (value: OverlayValue<T> | undefined): T | undefined =>
    value === undefined || value === TOMBSTONE
      ? undefined
      : value

  return {
    get: (id) => {
      if (overlay.has(id)) {
        return read(overlay.get(id))
      }
      return base[id]
    },
    set: (id, value) => {
      overlay.set(id, value)
    },
    delete: (id) => {
      overlay.set(id, TOMBSTONE)
    },
    entries: function * entries() {
      const visited = new Set<Id>()

      for (const [id, value] of overlay.entries()) {
        visited.add(id)
        const next = read(value)
        if (next !== undefined) {
          yield [id, next]
        }
      }

      for (const [id, value] of Object.entries(base) as [Id, T][]) {
        if (!visited.has(id)) {
          yield [id, value]
        }
      }
    },
    values: function * values() {
      for (const [, value] of this.entries()) {
        yield value
      }
    },
    materialize: () => {
      const next = { ...base } as Record<Id, T>

      for (const [id, value] of overlay.entries()) {
        if (value === TOMBSTONE) {
          delete next[id]
          continue
        }
        next[id] = value
      }

      return next
    }
  }
}
