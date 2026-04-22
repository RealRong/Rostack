import type { Action, Family, Ids } from '../contracts/core'
import { createIds } from './change'
import type { PublishedValue } from './value'

const areIdsEqual = <TKey>(
  left: readonly TKey[],
  right: readonly TKey[]
): boolean => {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) {
      return false
    }
  }

  return true
}

export interface PublishedFamily<TKey, TValue> {
  value: Family<TKey, TValue>
  ids: Ids<TKey>
  changed: boolean
  action: Action
}

export interface PublishFamilyInput<TKey, TNext, TValue> {
  previous: Family<TKey, TValue>
  ids: readonly TKey[]
  read(key: TKey): TNext
  publish(input: {
    key: TKey
    previous: TValue | undefined
    next: TNext
  }): PublishedValue<TValue>
}

export const publishFamily = <TKey, TNext, TValue>(
  input: PublishFamilyInput<TKey, TNext, TValue>
): PublishedFamily<TKey, TValue> => {
  const previous = input.previous
  const nextIds = input.ids
  const previousIds = previous.ids
  const previousById = previous.byId
  const nextById = new Map<TKey, TValue>()
  const nextIdSet = new Set(nextIds)
  const changedIds = new Set<TKey>()
  const idsEqual = areIdsEqual(previousIds, nextIds)
  let entriesEqual = idsEqual

  nextIds.forEach((key) => {
    const previousValue = previousById.get(key)
    const result = input.publish({
      key,
      previous: previousValue,
      next: input.read(key)
    })

    nextById.set(key, result.value)

    if (previousValue !== result.value || result.changed || !previousById.has(key)) {
      changedIds.add(key)
      entriesEqual = false
    }
  })

  previousIds.forEach((key) => {
    if (nextIdSet.has(key)) {
      return
    }

    changedIds.add(key)
    entriesEqual = false
  })

  if (!idsEqual) {
    previousIds.forEach((key) => {
      changedIds.add(key)
    })
    nextIds.forEach((key) => {
      changedIds.add(key)
    })
  }

  if (idsEqual && entriesEqual) {
    return {
      value: previous,
      ids: createIds<TKey>(),
      changed: false,
      action: 'reuse'
    }
  }

  return {
    value: {
      ids: idsEqual ? previous.ids : [...nextIds],
      byId: nextById
    },
    ids: createIds(changedIds),
    changed: true,
    action: 'rebuild'
  }
}
