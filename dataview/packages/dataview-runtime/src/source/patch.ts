import {
  equal,
  store
} from '@shared/core'
import {
  createEntityDeltaSync,
  type EntityDelta
} from '@shared/projector'
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

interface EntityDeltaSnapshot<Key, Value> {
  ids: readonly Key[]
  readValue(key: Key): Value | undefined
}

const applyTablePatch = <Key, Value>(
  table: store.TableStore<Key, Value>,
  patch: {
    set?: readonly (readonly [Key, Value])[]
    remove?: readonly Key[]
  }
) => {
  if (!patch.set?.length && !patch.remove?.length) {
    return
  }

  table.write.apply({
    ...(patch.set?.length
      ? { set: patch.set }
      : {}),
    ...(patch.remove?.length
      ? { remove: patch.remove }
      : {})
  })
}

const createEntityDeltaTableSync = <Key, Value>() =>
  createEntityDeltaSync<
    EntityDeltaSnapshot<Key, Value>,
    EntityDelta<Key> | undefined,
    {
      ids?: store.ValueStore<readonly Key[]>
      table: store.TableStore<Key, Value>
    },
    Key,
    Value
  >({
    delta: change => change,
    list: snapshot => snapshot.ids,
    read: (snapshot, key) => snapshot.readValue(key),
    apply: (patch, runtime) => {
      if (patch.order && runtime.ids) {
        runtime.ids.set(patch.order)
      }

      applyTablePatch(runtime.table, patch)
    }
  })

const createMappedEntityDeltaTableSync = <
  PublicKey,
  InternalKey,
  Value
>(
  keyOf: (key: PublicKey) => InternalKey
) => createEntityDeltaSync<
  {
    readValue(key: PublicKey): Value | undefined
  },
  EntityDelta<PublicKey> | undefined,
  store.TableStore<InternalKey, Value>,
  PublicKey,
  Value
>({
  delta: change => {
    if (!change || (!change.set?.length && !change.remove?.length)) {
      return undefined
    }

    return {
      ...(change.set?.length
        ? { set: change.set }
        : {}),
      ...(change.remove?.length
        ? { remove: change.remove }
        : {})
    }
  },
  list: () => [],
  read: (snapshot, key) => snapshot.readValue(key),
  apply: (patch, table) => {
    const set = patch.set?.map(([key, value]) => [keyOf(key), value] as const)
    const remove = patch.remove?.map(keyOf)

    applyTablePatch(table, {
      ...(set?.length
        ? { set }
        : {}),
      ...(remove?.length
        ? { remove }
        : {})
    })
  }
})

export const applyEntityDelta = <Key, Value>(input: {
  delta: EntityDelta<Key> | undefined
  runtime: {
    ids?: store.ValueStore<readonly Key[]>
    table: store.TableStore<Key, Value>
  }
  readIds: () => readonly Key[]
  readValue: (key: Key) => Value | undefined
}) => {
  const snapshot: EntityDeltaSnapshot<Key, Value> = {
    get ids() {
      return input.readIds()
    },
    readValue: input.readValue
  }

  createEntityDeltaTableSync<Key, Value>().sync({
    previous: snapshot,
    next: snapshot,
    change: input.delta,
    sink: input.runtime
  })
}

export const applyMappedEntityDelta = <PublicKey, InternalKey, Value>(input: {
  delta: EntityDelta<PublicKey> | undefined
  table: store.TableStore<InternalKey, Value>
  keyOf: (key: PublicKey) => InternalKey
  readValue: (key: PublicKey) => Value | undefined
}) => {
  const snapshot = {
    readValue: input.readValue
  }

  createMappedEntityDeltaTableSync<PublicKey, InternalKey, Value>(
    input.keyOf
  ).sync({
    previous: snapshot,
    next: snapshot,
    change: input.delta,
    sink: input.table
  })
}
