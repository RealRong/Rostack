import type * as source from '../contracts/source'

export interface ListSyncSpec<
  TSnapshot,
  TChange,
  TSink,
  TValue
> {
  hasChanged(change: TChange): boolean
  read(snapshot: TSnapshot): readonly TValue[]
  write(value: readonly TValue[], sink: TSink): void
}

export const createListSync = <
  TSnapshot,
  TChange,
  TSink,
  TValue
>(
  spec: ListSyncSpec<TSnapshot, TChange, TSink, TValue>
): source.Sync<TSnapshot, TChange, TSink> => ({
  sync: (input) => {
    if (!spec.hasChanged(input.change)) {
      return
    }

    spec.write(
      spec.read(input.next),
      input.sink
    )
  }
})
