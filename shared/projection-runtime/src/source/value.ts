import type * as source from '../contracts/source'

export interface ValueSyncSpec<
  TSnapshot,
  TChange,
  TSink,
  TValue
> {
  hasChanged(change: TChange): boolean
  read(snapshot: TSnapshot): TValue
  write(value: TValue, sink: TSink): void
}

export const createValueSync = <
  TSnapshot,
  TChange,
  TSink,
  TValue
>(
  spec: ValueSyncSpec<TSnapshot, TChange, TSink, TValue>
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
