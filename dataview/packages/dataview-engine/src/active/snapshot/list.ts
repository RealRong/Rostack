import {
  createOrderedAccess,
  createOrderedKeyedAccess,
  createOrderedKeyedCollection,
  type OrderedAccess,
  type OrderedKeyedAccess,
  type OrderedKeyedCollection
} from '@shared/core'

export type OrderedListAccess<TId> = OrderedAccess<TId>
export type OrderedKeyedListAccess<TId, TValue> = OrderedKeyedAccess<TId, TValue>
export type OrderedKeyedListCollection<TId, TValue> = OrderedKeyedCollection<TId, TValue>

export const createOrderedListAccess = <TId,>(
  ids: readonly TId[]
): OrderedListAccess<TId> => createOrderedAccess(ids)

export const createOrderedKeyedListAccess = <TId, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
}): OrderedKeyedListAccess<TId, TValue> => createOrderedKeyedAccess(input)

export const createOrderedKeyedListCollection = <TId, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
  all?: readonly TValue[]
}): OrderedKeyedListCollection<TId, TValue> => createOrderedKeyedCollection(input)
