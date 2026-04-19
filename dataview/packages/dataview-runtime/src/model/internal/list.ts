import {
  createDerivedStore,
  read,
  sameOrder,
  type Equality,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'

export const createEntityListStore = <TId, T>(input: {
  ids: ReadStore<readonly TId[]>
  values: KeyedReadStore<TId, T | undefined>
  isEqual?: Equality<readonly T[]>
}) => createDerivedStore<readonly T[]>({
  get: () => read(input.ids)
    .flatMap(id => {
      const value = read(input.values, id)
      return value ? [value] : []
    }),
  isEqual: input.isEqual ?? sameOrder
})
