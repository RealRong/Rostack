import {
  collection,
  equal,
  store
} from '@shared/core'

export const createPresentSourceListStore = <TId, T>(input: {
  ids: store.ReadStore<readonly TId[]>
  values: store.KeyedReadStore<TId, T | undefined>
  isEqual?: equal.Equality<readonly T[]>
}) => store.createDerivedStore<readonly T[]>({
  get: () => collection.presentValues(
    store.read(input.ids),
    id => store.read(input.values, id)
  ),
  isEqual: input.isEqual ?? equal.sameOrder
})
