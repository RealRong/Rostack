import { collection } from '@shared/core'


export type OrderedListAccess<TId> = collection.OrderedAccess<TId>
export type OrderedKeyedListAccess<TId, TValue> = collection.OrderedKeyedAccess<TId, TValue>
export type OrderedKeyedListCollection<TId, TValue> = collection.OrderedKeyedCollection<TId, TValue>

export const createOrderedListAccess = <TId,>(
  ids: readonly TId[]
): OrderedListAccess<TId> => collection.createOrderedAccess(ids)

export const createOrderedKeyedListAccess = <TId, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
}): OrderedKeyedListAccess<TId, TValue> => collection.createOrderedKeyedAccess(input)

export const createOrderedKeyedListCollection = <TId, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
  all?: readonly TValue[]
}): OrderedKeyedListCollection<TId, TValue> => collection.createOrderedKeyedCollection(input)
