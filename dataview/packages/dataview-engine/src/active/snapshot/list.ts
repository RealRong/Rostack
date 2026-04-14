import {
  createOrderedAccess,
  createOrderedKeyedAccess,
  createOrderedKeyedCollection,
  type OrderedAccess,
  type OrderedKeyedAccess,
  type OrderedKeyedCollection
} from '@shared/core'

export type OrderedListAccess<TId extends string> = OrderedAccess<TId>
export type OrderedKeyedListAccess<TId extends string, TValue> = OrderedKeyedAccess<TId, TValue>
export type OrderedKeyedListCollection<TId extends string, TValue> = OrderedKeyedCollection<TId, TValue>

export const createOrderedListAccess = <TId extends string>(
  ids: readonly TId[]
): OrderedListAccess<TId> => createOrderedAccess(ids)

export const createOrderedKeyedListAccess = <TId extends string, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
}): OrderedKeyedListAccess<TId, TValue> => createOrderedKeyedAccess(input)

export const createOrderedKeyedListCollection = <TId extends string, TValue>(input: {
  ids: readonly TId[]
  get: (id: TId) => TValue | undefined
  all?: readonly TValue[]
}): OrderedKeyedListCollection<TId, TValue> => createOrderedKeyedCollection(input)
