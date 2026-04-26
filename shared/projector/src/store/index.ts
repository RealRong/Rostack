import { store } from '@shared/core'
import type { IdDelta } from '@shared/delta'

export interface ProjectorRuntimeLike<TSnapshot, TChange> {
  snapshot(): TSnapshot
  subscribe(
    listener: (
      snapshot: TSnapshot,
      change: TChange
    ) => void
  ): () => void
}

export interface ProjectorStoreValueField<
  TSnapshot,
  TChange,
  TValue
> {
  kind: 'value'
  read(snapshot: TSnapshot): TValue
  changed(change: TChange): boolean
  isEqual?: (left: TValue, right: TValue) => boolean
}

export interface ProjectorStoreFamilyField<
  TSnapshot,
  TChange,
  TKey extends string,
  TValue
> {
  kind: 'family'
  read(snapshot: TSnapshot): {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
  delta(change: TChange): IdDelta<TKey> | undefined
  isEqual?: (left: TValue, right: TValue) => boolean
}

export type ProjectorStoreField<TSnapshot, TChange> =
  | ProjectorStoreValueField<TSnapshot, TChange, any>
  | ProjectorStoreFamilyField<TSnapshot, TChange, string, any>

export interface ProjectorStoreSpec<TSnapshot, TChange> {
  fields: Record<string, ProjectorStoreField<TSnapshot, TChange>>
}

export interface ProjectorStoreFamilyRead<
  TKey extends string,
  TValue
> {
  ids: store.ReadStore<readonly TKey[]>
  byId: store.KeyedReadStore<TKey, TValue | undefined>
}

export type InferProjectorStoreRead<
  TSpec extends ProjectorStoreSpec<any, any>
> = {
  [TKey in keyof TSpec['fields']]: TSpec['fields'][TKey] extends ProjectorStoreValueField<any, any, infer TValue>
    ? store.ReadStore<TValue>
    : TSpec['fields'][TKey] extends ProjectorStoreFamilyField<any, any, infer TFamilyKey, infer TFamilyValue>
      ? ProjectorStoreFamilyRead<TFamilyKey, TFamilyValue>
      : never
}

export interface ProjectorStore<
  TSnapshot,
  TChange,
  TRead
> {
  readonly read: TRead
  snapshot(): TSnapshot
  sync(input: {
    previous: TSnapshot
    next: TSnapshot
    change: TChange
  }): void
  dispose(): void
}

export const value = <
  TSnapshot,
  TChange,
  TValue
>(
  input: {
    read(snapshot: TSnapshot): TValue
    changed(change: TChange): boolean
    isEqual?: (left: TValue, right: TValue) => boolean
  }
): ProjectorStoreValueField<TSnapshot, TChange, TValue> => ({
  kind: 'value',
  read: input.read,
  changed: input.changed,
  ...(input.isEqual
    ? {
        isEqual: input.isEqual
      }
    : {})
})

export const family = <
  TSnapshot,
  TChange,
  TKey extends string,
  TValue
>(
  input: {
    read(snapshot: TSnapshot): {
      ids: readonly TKey[]
      byId: ReadonlyMap<TKey, TValue>
    }
    delta(change: TChange): IdDelta<TKey> | undefined
    isEqual?: (left: TValue, right: TValue) => boolean
  }
): ProjectorStoreFamilyField<TSnapshot, TChange, TKey, TValue> => ({
  kind: 'family',
  read: input.read,
  delta: input.delta,
  ...(input.isEqual
    ? {
        isEqual: input.isEqual
      }
    : {})
})

const createFamilyRead = <
  TKey extends string,
  TValue
>(
  input: {
    family: store.FamilyStore<TKey, TValue>
    isEqual?: (left: TValue, right: TValue) => boolean
  }
): ProjectorStoreFamilyRead<TKey, TValue> => ({
  ids: input.family.ids,
  byId: store.createKeyedReadStore<TKey, TValue | undefined>({
    get: (key) => input.family.read.get(key),
    subscribe: (key, listener) => input.family.byId.subscribe.key(key, listener),
    isEqual: (left, right) => {
      if (left === undefined || right === undefined) {
        return left === right
      }

      return input.isEqual
        ? input.isEqual(left, right)
        : Object.is(left, right)
    }
  })
})

const isFamilyField = <
  TSnapshot,
  TChange
>(
  field: ProjectorStoreField<TSnapshot, TChange>
): field is ProjectorStoreFamilyField<TSnapshot, TChange, string, unknown> => field.kind === 'family'

export const createProjectorStore = <
  TSnapshot,
  TChange,
  TSpec extends ProjectorStoreSpec<TSnapshot, TChange>
>(
  input:
    | {
        runtime: ProjectorRuntimeLike<TSnapshot, TChange>
        spec: TSpec
      }
    | {
        initial: TSnapshot
        spec: TSpec
      }
): ProjectorStore<TSnapshot, TChange, InferProjectorStoreRead<TSpec>> => {
  let currentSnapshot = 'runtime' in input
    ? input.runtime.snapshot()
    : input.initial

  const syncEntries: Array<(input: {
    previous: TSnapshot
    next: TSnapshot
    change: TChange
  }) => void> = []
  const read: Record<string, unknown> = {}

  Object.entries(input.spec.fields).forEach(([fieldKey, field]) => {
    if (isFamilyField(field)) {
      const familyStore = store.createFamilyStore({
        initial: field.read(currentSnapshot),
        ...(field.isEqual
          ? {
              isEqual: field.isEqual
            }
          : {})
      })

      read[fieldKey] = createFamilyRead({
        family: familyStore,
        isEqual: field.isEqual
      })
      syncEntries.push((event) => {
        const delta = field.delta(event.change)
        if (!delta) {
          return
        }

        const previous = field.read(event.previous)
        const next = field.read(event.next)
        const ids = previous.ids === next.ids
          ? undefined
          : next.ids
        let set: Array<readonly [string, unknown]> | undefined

        const append = (
          keys: ReadonlySet<string>
        ) => {
          keys.forEach((key) => {
            const value = next.byId.get(key)
            if (value === undefined) {
              return
            }

            if (!set) {
              set = []
            }

            set.push([key, value] as const)
          })
        }

        append(delta.added)
        append(delta.updated)

        const remove = delta.removed.size > 0
          ? [...delta.removed]
          : undefined

        if (ids === undefined && !set?.length && !remove?.length) {
          return
        }

        familyStore.write.apply({
          ...(ids !== undefined
            ? {
                ids
              }
            : {}),
          ...(set?.length
            ? {
                set
              }
            : {}),
          ...(remove?.length
            ? {
                remove
              }
            : {})
        })
      })
      return
    }

    const valueStore = store.createValueStore(
      field.read(currentSnapshot),
      {
        ...(field.isEqual
          ? {
              isEqual: field.isEqual
            }
          : {})
      }
    )

    read[fieldKey] = valueStore
    syncEntries.push((event) => {
      if (!field.changed(event.change)) {
        return
      }

      valueStore.set(field.read(event.next))
    })
  })

  let unsubscribe = () => {}
  let disposed = false

  const sync = (event: {
    previous: TSnapshot
    next: TSnapshot
    change: TChange
  }) => {
    currentSnapshot = event.next

    store.batch(() => {
      syncEntries.forEach((entry) => {
        entry(event)
      })
    })
  }

  if ('runtime' in input) {
    unsubscribe = input.runtime.subscribe((snapshot, change) => {
      const previous = currentSnapshot
      sync({
        previous,
        next: snapshot,
        change
      })
    })
  }

  return {
    read: read as InferProjectorStoreRead<TSpec>,
    snapshot: () => currentSnapshot,
    sync,
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      unsubscribe()
    }
  }
}
