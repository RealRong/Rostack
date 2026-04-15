import {
  touchedFieldCountOfImpact,
  touchedRecordCountOfImpact
} from '@dataview/core/commit/impact'
import type {
  CommitImpact
} from '@dataview/core/contracts'

export const createOrderIndex = <T extends string>(
  ids: readonly T[]
): ReadonlyMap<T, number> => {
  const order = new Map<T, number>()

  ids.forEach((id, index) => {
    order.set(id, index)
  })

  return order
}

export const removeOrderedIdInPlace = <T extends string>(
  ids: T[],
  id: T
): boolean => {
  const index = ids.indexOf(id)
  if (index < 0) {
    return false
  }

  ids.splice(index, 1)
  return true
}

export const insertOrderedIdInPlace = <T extends string>(
  ids: T[],
  id: T,
  order: ReadonlyMap<T, number>
): boolean => {
  if (ids.includes(id)) {
    return false
  }

  const nextOrder = order.get(id) ?? Number.MAX_SAFE_INTEGER
  const index = ids.findIndex(current => (
    (order.get(current) ?? Number.MAX_SAFE_INTEGER) > nextOrder
  ))

  if (index < 0) {
    ids.push(id)
    return true
  }

  ids.splice(index, 0, id)
  return true
}

export const touchedRecordCountOf = (
  impact: CommitImpact
): number | 'all' | undefined => touchedRecordCountOfImpact(impact)

export const touchedFieldCountOf = (
  impact: CommitImpact
): number | 'all' | undefined => touchedFieldCountOfImpact(impact)
