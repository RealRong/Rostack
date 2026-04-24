import { changeSet } from '@shared/core'
import { createIds, type Family, type Ids } from '@shared/projection-runtime'
import type { IdDelta } from '../../contracts/delta'

export interface PatchedFamily<TKey, TValue> {
  value: Family<TKey, TValue>
  ids: Ids<TKey>
  changed: boolean
}

export const patchPublishedFamily = <TKey extends string, TValue>(input: {
  previous: Family<TKey, TValue>
  ids: readonly TKey[]
  delta: IdDelta<TKey>
  read(id: TKey): TValue | undefined
}): PatchedFamily<TKey, TValue> => {
  if (!changeSet.hasAny(input.delta)) {
    return {
      value: input.previous,
      ids: createIds<TKey>(),
      changed: false
    }
  }

  const nextById = new Map(input.previous.byId)
  const changedIds = new Set<TKey>()

  input.delta.removed.forEach((id) => {
    nextById.delete(id)
    changedIds.add(id)
  })

  input.delta.added.forEach((id) => {
    const value = input.read(id)
    if (value !== undefined) {
      nextById.set(id, value)
      changedIds.add(id)
    }
  })

  input.delta.updated.forEach((id) => {
    const value = input.read(id)
    if (value !== undefined) {
      nextById.set(id, value)
      changedIds.add(id)
    }
  })

  const membershipChanged = (
    input.delta.added.size > 0
    || input.delta.removed.size > 0
  )
  const nextIds = membershipChanged
    ? input.ids.filter((id) => nextById.has(id))
    : input.previous.ids

  return {
    value: {
      ids: nextIds,
      byId: nextById
    },
    ids: createIds(changedIds),
    changed: true
  }
}
