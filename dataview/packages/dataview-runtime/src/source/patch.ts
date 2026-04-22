import { equal, store } from '@shared/core'
import type {
  CollectionDelta
} from '@dataview/engine'
import type {
  EntitySource
} from '@dataview/runtime/source/contracts'

export interface EntitySourceRuntime<Key, Value> {
  source: EntitySource<Key, Value>
  ids: store.ValueStore<readonly Key[]>
  values: store.KeyedStore<Key, Value | undefined>
  clear(): void
}

export const createEntitySourceRuntime = <Key, Value>(
  emptyIds: readonly Key[] = [] as readonly Key[]
): EntitySourceRuntime<Key, Value> => {
  const ids = store.createValueStore<readonly Key[]>({
    initial: emptyIds,
    isEqual: equal.sameOrder
  })
  const values = store.createKeyedStore<Key, Value | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      ids,
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    },
    ids,
    values,
    clear: () => {
      ids.set(emptyIds)
      values.clear()
    }
  }
}

export const resetEntityRuntime = <Key, Value>(runtime: {
  ids: store.ValueStore<readonly Key[]>
  values: store.KeyedStore<Key, Value | undefined>
}, input: {
  ids: readonly Key[]
  values: readonly (readonly [Key, Value])[]
}) => {
  runtime.ids.set(input.ids)
  runtime.values.clear()
  if (!input.values.length) {
    return
  }

  runtime.values.patch({
    set: input.values
  })
}

export const applyEntityDelta = <Key, Value>(input: {
  delta: CollectionDelta<Key> | undefined
  runtime: {
    ids?: store.ValueStore<readonly Key[]>
    values: store.KeyedStore<Key, Value | undefined>
  }
  readIds: () => readonly Key[]
  readValue: (key: Key) => Value | undefined
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.list && input.runtime.ids) {
    input.runtime.ids.set(input.readIds())
  }

  let set: Array<readonly [Key, Value]> | undefined
  const update = input.delta.update
  if (update?.length) {
    set = []
    for (let index = 0; index < update.length; index += 1) {
      const key = update[index]!
      const value = input.readValue(key)
      if (value === undefined) {
        continue
      }

      set.push([key, value] as const)
    }
  }

  if (!set?.length && !input.delta.remove?.length) {
    return
  }

  input.runtime.values.patch({
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(input.delta.remove?.length
      ? {
          delete: input.delta.remove
        }
      : {})
  })
}
