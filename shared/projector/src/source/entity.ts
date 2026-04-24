import type { EntityDelta } from '../delta/entityDelta'
import type * as source from '../contracts/source'

export interface EntityDeltaSyncPatch<TKey, TValue> {
  order?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue])[]
  remove?: readonly TKey[]
}

export interface EntityDeltaSyncSpec<
  TSnapshot,
  TChange,
  TSink,
  TKey,
  TValue
> {
  delta(change: TChange): EntityDelta<TKey> | undefined
  list(snapshot: TSnapshot): readonly TKey[]
  read(snapshot: TSnapshot, key: TKey): TValue | undefined
  apply(
    patch: EntityDeltaSyncPatch<TKey, TValue>,
    sink: TSink
  ): void
}

export const createEntityDeltaSync = <
  TSnapshot,
  TChange,
  TSink,
  TKey,
  TValue
>(
  spec: EntityDeltaSyncSpec<TSnapshot, TChange, TSink, TKey, TValue>
): source.Sync<TSnapshot, TChange, TSink> => ({
  sync: (input) => {
    const delta = spec.delta(input.change)
    if (!delta) {
      return
    }

    let set: Array<readonly [TKey, TValue]> | undefined
    if (delta.set?.length) {
      set = []
      for (let index = 0; index < delta.set.length; index += 1) {
        const key = delta.set[index]!
        const value = spec.read(input.next, key)
        if (value === undefined) {
          continue
        }

        set.push([key, value] as const)
      }
    }

    const order = delta.order
      ? spec.list(input.next)
      : undefined

    if (!order && !set?.length && !delta.remove?.length) {
      return
    }

    spec.apply({
      ...(order
        ? { order }
        : {}),
      ...(set?.length
        ? { set }
        : {}),
      ...(delta.remove?.length
        ? { remove: delta.remove }
        : {})
    }, input.sink)
  }
})
