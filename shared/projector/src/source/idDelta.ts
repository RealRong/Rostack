import type { Family } from '../contracts/core'
import type * as source from '../contracts/source'
import type { IdDelta } from '@shared/delta'

export interface IdDeltaFamilySyncPatch<TKey, TValue> {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue])[]
  remove?: readonly TKey[]
}

export interface IdDeltaFamilySyncSpec<
  TSnapshot,
  TChange,
  TSink,
  TKey extends string,
  TValue
> {
  delta(change: TChange): IdDelta<TKey> | undefined
  read(snapshot: TSnapshot): Family<TKey, TValue>
  apply(
    patch: IdDeltaFamilySyncPatch<TKey, TValue>,
    sink: TSink
  ): void
}

export const createIdDeltaFamilySync = <
  TSnapshot,
  TChange,
  TSink,
  TKey extends string,
  TValue
>(
  spec: IdDeltaFamilySyncSpec<TSnapshot, TChange, TSink, TKey, TValue>
): source.Sync<TSnapshot, TChange, TSink> => ({
  sync: (input) => {
    const delta = spec.delta(input.change)
    if (!delta) {
      return
    }

    const previous = spec.read(input.previous)
    const next = spec.read(input.next)
    const ids = previous.ids === next.ids
      ? undefined
      : next.ids

    let set: Array<readonly [TKey, TValue]> | undefined
    const append = (keys: ReadonlySet<TKey>) => {
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

    spec.apply({
      ...(ids !== undefined
        ? { ids }
        : {}),
      ...(set?.length
        ? { set }
        : {}),
      ...(remove?.length
        ? { remove }
        : {})
    }, input.sink)
  }
})
