import {
  equal,
  store
} from '@shared/core'
import type {
  IdDelta
} from '@shared/delta'
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

const replaceKeyedValues = <Key, Value>(
  values: store.KeyedStore<Key, Value | undefined>,
  entries: readonly (readonly [Key, Value])[]
) => {
  const nextKeySet = new Set(entries.map(([key]) => key))
  const remove = [...values.all().keys()].filter((key) => !nextKeySet.has(key))

  values.patch({
    ...(entries.length
      ? {
          set: entries
        }
      : {}),
    ...(remove.length
      ? {
          delete: remove
        }
      : {})
  })
}

const applyKeyedValueDelta = <Key, Value>(input: {
  delta: {
    added: ReadonlySet<Key>
    updated: ReadonlySet<Key>
    removed: ReadonlySet<Key>
  }
  values: store.KeyedStore<Key, Value | undefined>
  readValue: (key: Key) => Value | undefined
}) => {
  const set: Array<readonly [Key, Value]> = []
  const remove = new Set<Key>(input.delta.removed)

  const touch = (key: Key) => {
    const value = input.readValue(key)
    if (value === undefined) {
      remove.add(key)
      return
    }

    remove.delete(key)
    set.push([key, value] as const)
  }

  input.delta.added.forEach(touch)
  input.delta.updated.forEach(touch)

  input.values.patch({
    ...(set.length
      ? {
          set
        }
      : {}),
    ...(remove.size
      ? {
          delete: remove
        }
      : {})
  })
}

export interface SourceTableRuntime<Key, Value> {
  source: store.KeyedReadStore<Key, Value | undefined>
  store: store.KeyedStore<Key, Value | undefined>
  clear(): void
}

export interface MappedSourceTableRuntime<PublicKey, InternalKey, Value> {
  source: store.KeyedReadStore<PublicKey, Value | undefined>
  store: store.KeyedStore<InternalKey, Value | undefined>
  clear(): void
}

export const createSourceTableRuntime = <Key, Value>(options: {
  isEqual?: equal.Equality<Value>
} = {}): SourceTableRuntime<Key, Value> => {
  const values = store.createKeyedStore<Key, Value | undefined>({
    emptyValue: undefined,
    isEqual: (left, right) => sameOptionalValue(
      options.isEqual ?? equal.sameValue,
      left,
      right
    )
  })

  return {
    source: values,
    store: values,
    clear: () => {
      values.clear()
    }
  }
}

export const createMappedTableSourceRuntime = <PublicKey, InternalKey, Value>(input: {
  keyOf: (key: PublicKey) => InternalKey
  isEqual?: equal.Equality<Value>
}): MappedSourceTableRuntime<PublicKey, InternalKey, Value> => {
  const values = store.createKeyedStore<InternalKey, Value | undefined>({
    emptyValue: undefined,
    isEqual: (left, right) => sameOptionalValue(
      input.isEqual ?? equal.sameValue,
      left,
      right
    )
  })

  return {
    source: store.keyed<PublicKey, Value | undefined>({
      get: key => values.get(input.keyOf(key)),
      subscribe: (key, listener) => values.subscribe(
        input.keyOf(key),
        listener
      ),
      isEqual: (left, right) => sameOptionalValue(
        input.isEqual ?? equal.sameValue,
        left,
        right
      )
    }),
    store: values,
    clear: () => {
      values.clear()
    }
  }
}

export interface EntitySourceRuntime<Key, Value> {
  source: EntitySource<Key, Value>
  ids: store.ValueStore<readonly Key[]>
  store: store.KeyedStore<Key, Value | undefined>
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
    store: values.store,
    clear: () => {
      ids.set(emptyIds)
      values.clear()
    }
  }
}

export const resetEntityRuntime = <Key, Value>(runtime: {
  ids: store.ValueStore<readonly Key[]>
  store: store.KeyedStore<Key, Value | undefined>
}, input: {
  ids: readonly Key[]
  values: readonly (readonly [Key, Value])[]
}) => {
  runtime.ids.set(input.ids)
  replaceKeyedValues(runtime.store, input.values)
}

export const resetSourceTableRuntime = <Key, Value>(
  runtime: {
    store: store.KeyedStore<Key, Value | undefined>
  },
  values: readonly (readonly [Key, Value])[]
) => {
  replaceKeyedValues(runtime.store, values)
}

export const applyEntityDelta = <Key, Value>(input: {
  delta: IdDelta<Key> | undefined
  runtime: {
    ids?: store.ValueStore<readonly Key[]>
    store: store.KeyedStore<Key, Value | undefined>
  }
  readIds: () => readonly Key[]
  readValue: (key: Key) => Value | undefined
}) => {
  if (!input.delta) {
    return
  }

  if (input.runtime.ids) {
    input.runtime.ids.set(input.readIds())
  }

  const delta = {
    added: new Set<Key>(),
    updated: new Set<Key>(),
    removed: new Set<Key>()
  }

  input.delta.added.forEach((key) => {
    delta.added.add(key)
  })
  input.delta.updated.forEach((key) => {
    delta.updated.add(key)
  })
  input.delta.removed.forEach((key) => {
    delta.removed.add(key)
  })

  applyKeyedValueDelta({
    delta,
    values: input.runtime.store,
    readValue: input.readValue
  })
}

export const applyMappedEntityDelta = <PublicKey, InternalKey, Value>(input: {
  delta: IdDelta<PublicKey> | undefined
  store: store.KeyedStore<InternalKey, Value | undefined>
  keyOf: (key: PublicKey) => InternalKey
  readValue: (key: PublicKey) => Value | undefined
}) => {
  if (!input.delta) {
    return
  }

  const set: Array<readonly [InternalKey, Value]> = []
  const remove = new Set<InternalKey>()

  const touch = (key: PublicKey) => {
    const value = input.readValue(key)
    const internalKey = input.keyOf(key)
    if (value === undefined) {
      remove.add(internalKey)
      return
    }

    remove.delete(internalKey)
    set.push([internalKey, value] as const)
  }

  input.delta.added.forEach((key) => {
    touch(key)
  })
  input.delta.updated.forEach((key) => {
    touch(key)
  })
  input.delta.removed.forEach((key) => {
    remove.add(input.keyOf(key))
  })

  input.store.patch({
    ...(set.length
      ? {
          set
        }
      : {}),
    ...(remove.size
      ? {
          delete: remove
        }
      : {})
  })
}
