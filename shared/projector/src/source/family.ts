import type * as source from '../contracts/source'

export interface FamilySyncSpec<
  TSnapshot,
  TChange,
  TSink,
  TKey,
  TValue
> {
  ids(change: TChange): ReadonlySet<TKey> | 'all'
  list(snapshot: TSnapshot): readonly TKey[]
  read(snapshot: TSnapshot, key: TKey): TValue | undefined
  set(key: TKey, value: TValue, sink: TSink): void
  remove(key: TKey, sink: TSink): void
  hasOrderChanged?(change: TChange): boolean
  order?(ids: readonly TKey[], sink: TSink): void
}

const collectAllIds = <TKey>(
  previous: readonly TKey[],
  next: readonly TKey[]
): ReadonlySet<TKey> => new Set<TKey>([
  ...previous,
  ...next
])

export const createFamilySync = <
  TSnapshot,
  TChange,
  TSink,
  TKey,
  TValue
>(
  spec: FamilySyncSpec<TSnapshot, TChange, TSink, TKey, TValue>
): source.Sync<TSnapshot, TChange, TSink> => ({
  sync: (input) => {
    const changedIds = spec.ids(input.change)
    const ids = changedIds === 'all'
      ? collectAllIds(
          spec.list(input.previous),
          spec.list(input.next)
        )
      : changedIds

    ids.forEach((key) => {
      const nextValue = spec.read(input.next, key)
      if (nextValue === undefined) {
        spec.remove(key, input.sink)
        return
      }

      spec.set(key, nextValue, input.sink)
    })

    if (!spec.order || !spec.hasOrderChanged?.(input.change)) {
      return
    }

    spec.order(
      spec.list(input.next),
      input.sink
    )
  }
})
