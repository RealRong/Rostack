import type * as source from '../contracts/source'

export const composeSync = <
  TSnapshot,
  TChange,
  TSink
>(
  ...syncs: readonly source.Sync<TSnapshot, TChange, TSink>[]
): source.Sync<TSnapshot, TChange, TSink> => ({
  sync: (input) => {
    syncs.forEach((sync) => {
      sync.sync(input)
    })
  }
})
