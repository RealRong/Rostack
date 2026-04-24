import { equal, store } from '@shared/core'
import type {
  CollectionDelta,
  KeyDelta,
  ListedDelta
} from '@dataview/engine'
import type {
  EntitySource
} from '@dataview/runtime/source/contracts'

const sameOptionalValue = <Value,>(
  isEqual: equal.Equality<Value>,
  left: Value | undefined,
  right: Value | undefined
) => left === right || (
  left !== undefined
  && right !== undefined
  && isEqual(left, right)
)

export interface SourceTableRuntime<Key, Value> {
  source: store.KeyedReadStore<Key, Value | undefined>
  table: store.TableStore<Key, Value>
  clear(): void
}

export interface MappedSourceTableRuntime<PublicKey, InternalKey, Value> {
  source: store.KeyedReadStore<PublicKey, Value | undefined>
  table: store.TableStore<InternalKey, Value>
  clear(): void
}

export const createSourceTableRuntime = <Key, Value>(options: {
  isEqual?: equal.Equality<Value>
} = {}): SourceTableRuntime<Key, Value> => {
  const table = store.createTableStore<Key, Value>({
    isEqual: options.isEqual
  })

  return {
    source: store.createKeyedReadStore<Key, Value | undefined>({
      get: key => table.read.get(key),
      subscribe: (key, listener) => table.subscribe.key(key, listener),
      isEqual: (left, right) => sameOptionalValue(
        options.isEqual ?? equal.sameValue,
        left,
        right
      )
    }),
    table,
    clear: () => {
      table.write.clear()
    }
  }
}

export const createMappedTableSourceRuntime = <PublicKey, InternalKey, Value>(input: {
  keyOf: (key: PublicKey) => InternalKey
  isEqual?: equal.Equality<Value>
}): MappedSourceTableRuntime<PublicKey, InternalKey, Value> => {
  const table = store.createTableStore<InternalKey, Value>({
    isEqual: input.isEqual
  })

  return {
    source: store.createKeyedReadStore<PublicKey, Value | undefined>({
      get: key => table.read.get(input.keyOf(key)),
      subscribe: (key, listener) => table.subscribe.key(
        input.keyOf(key),
        listener
      ),
      isEqual: (left, right) => sameOptionalValue(
        input.isEqual ?? equal.sameValue,
        left,
        right
      )
    }),
    table,
    clear: () => {
      table.write.clear()
    }
  }
}

export interface EntitySourceRuntime<Key, Value> {
  source: EntitySource<Key, Value>
  ids: store.ValueStore<readonly Key[]>
  table: store.TableStore<Key, Value>
  clear(): void
}

export const createEntitySourceRuntime = <Key, Value>(
  emptyIds: readonly Key[] = [] as readonly Key[]
): EntitySourceRuntime<Key, Value> => {
  const ids = store.createValueStore<readonly Key[]>({
    initial: emptyIds,
    isEqual: equal.sameOrder
  })
  const values = createSourceTableRuntime<Key, Value>()

  return {
    source: {
      ids,
      get: values.source.get,
      subscribe: values.source.subscribe,
      isEqual: values.source.isEqual
    },
    ids,
    table: values.table,
    clear: () => {
      ids.set(emptyIds)
      values.clear()
    }
  }
}

export const resetEntityRuntime = <Key, Value>(runtime: {
  ids: store.ValueStore<readonly Key[]>
  table: store.TableStore<Key, Value>
}, input: {
  ids: readonly Key[]
  values: readonly (readonly [Key, Value])[]
}) => {
  runtime.ids.set(input.ids)
  runtime.table.write.replace(new Map(input.values))
}

export const applyEntityDelta = <Key, Value>(input: {
  delta: CollectionDelta<Key> | undefined
  runtime: {
    ids?: store.ValueStore<readonly Key[]>
    table: store.TableStore<Key, Value>
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

  input.runtime.table.write.apply({
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(input.delta.remove?.length
      ? {
          remove: input.delta.remove
        }
      : {})
  })
}

export const applyListedDelta = <Key, Value>(input: {
  delta: ListedDelta<Key> | undefined
  runtime: {
    ids?: store.ValueStore<readonly Key[]>
    table: store.TableStore<Key, Value>
  }
  readIds: () => readonly Key[]
  readValue: (key: Key) => Value | undefined
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.ids && input.runtime.ids) {
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

  input.runtime.table.write.apply({
    ...(set?.length
      ? { set }
      : {}),
    ...(input.delta.remove?.length
      ? { remove: input.delta.remove }
      : {})
  })
}

export const applyKeyDelta = <Key, Value>(input: {
  delta: KeyDelta<Key> | undefined
  table: store.TableStore<Key, Value>
  readValue: (key: Key) => Value | undefined
}) => {
  if (!input.delta) {
    return
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

  input.table.write.apply({
    ...(set?.length
      ? { set }
      : {}),
    ...(input.delta.remove?.length
      ? { remove: input.delta.remove }
      : {})
  })
}

export const applyMappedKeyDelta = <PublicKey, InternalKey, Value>(input: {
  delta: KeyDelta<PublicKey> | undefined
  table: store.TableStore<InternalKey, Value>
  keyOf: (key: PublicKey) => InternalKey
  readValue: (key: PublicKey) => Value | undefined
}) => {
  if (!input.delta) {
    return
  }

  let set: Array<readonly [InternalKey, Value]> | undefined
  const update = input.delta.update
  if (update?.length) {
    set = []
    for (let index = 0; index < update.length; index += 1) {
      const key = update[index]!
      const value = input.readValue(key)
      if (value === undefined) {
        continue
      }

      set.push([input.keyOf(key), value] as const)
    }
  }

  if (!set?.length && !input.delta.remove?.length) {
    return
  }

  input.table.write.apply({
    ...(set?.length
      ? { set }
      : {}),
    ...(input.delta.remove?.length
      ? { remove: input.delta.remove.map(input.keyOf) }
      : {})
  })
}
