import { equal, store } from '@shared/core'


export const createEntityListStore = <TId, T>(input: {
  ids: store.ReadStore<readonly TId[]>
  values: store.KeyedReadStore<TId, T | undefined>
  isEqual?: equal.Equality<readonly T[]>
}) => store.createDerivedStore<readonly T[]>({
  get: () => store.read(input.ids)
    .flatMap(id => {
      const value = store.read(input.values, id)
      return value ? [value] : []
    }),
  isEqual: input.isEqual ?? equal.sameOrder
})
