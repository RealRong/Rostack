import {
  entityDelta,
  type EntityDelta
} from '@shared/delta'
import {
  idDelta,
  type IdDelta
} from '@shared/delta'
import type { Family } from '../contracts/core'
import {
  isListEqual,
  projectListChange
} from './list'

const createEmptyChange = <TKey,>(): IdDelta<TKey> => idDelta.create<TKey>()

const filterPresentIds = <TKey>(
  ids: readonly TKey[],
  byId: ReadonlyMap<TKey, unknown>
): readonly TKey[] => ids.filter((id) => byId.has(id))

export interface PublishedEntityFamily<TKey, TValue> {
  value: Family<TKey, TValue>
  change: IdDelta<TKey>
  delta?: EntityDelta<TKey>
}

export interface PublishedEntityList<TKey> {
  value: readonly TKey[]
  delta?: EntityDelta<TKey>
}

export const publishEntityList = <TKey>(input: {
  previous: readonly TKey[]
  next: readonly TKey[]
  set?: readonly TKey[]
  remove?: readonly TKey[]
}): PublishedEntityList<TKey> => {
  const listChange = projectListChange({
    previous: input.previous,
    next: input.next
  })
  const delta = entityDelta.normalize({
    ...(listChange.orderChanged
      ? {
          order: true as const
        }
      : {}),
    set: [
      ...listChange.added,
      ...(input.set ?? [])
    ],
    remove: [
      ...listChange.removed,
      ...(input.remove ?? [])
    ]
  })

  return {
    value: listChange.orderChanged
      ? input.next
      : input.previous,
    delta
  }
}

export const publishEntityFamily = <TKey extends string, TValue>(input: {
  previous: Family<TKey, TValue>
  ids: readonly TKey[]
  change: IdDelta<TKey>
  read(id: TKey): TValue | undefined
}): PublishedEntityFamily<TKey, TValue> => {
  const idsEqual = isListEqual(input.previous.ids, input.ids)
  let nextById: ReadonlyMap<TKey, TValue> = input.previous.byId
  const nextChange = createEmptyChange<TKey>()
  const updateById = (): Map<TKey, TValue> => {
    if (nextById === input.previous.byId) {
      nextById = new Map(input.previous.byId)
    }
    return nextById as Map<TKey, TValue>
  }

  input.change.removed.forEach((id) => {
    if (!input.previous.byId.has(id)) {
      return
    }

    updateById().delete(id)
    idDelta.remove(nextChange, id)
  })

  input.change.added.forEach((id) => {
    const value = input.read(id)
    if (value === undefined) {
      return
    }

    const previousValue = input.previous.byId.get(id)
    if (previousValue === value) {
      return
    }

    updateById().set(id, value)
    if (previousValue === undefined) {
      idDelta.add(nextChange, id)
      return
    }

    idDelta.update(nextChange, id)
  })

  input.change.updated.forEach((id) => {
    const value = input.read(id)
    if (value === undefined) {
      return
    }

    const previousValue = input.previous.byId.get(id)
    if (previousValue === value) {
      return
    }

    updateById().set(id, value)
    if (previousValue === undefined) {
      idDelta.add(nextChange, id)
      return
    }

    idDelta.update(nextChange, id)
  })

  const nextIds = idsEqual
    ? input.previous.ids
    : filterPresentIds(input.ids, nextById)
  const changed = !idsEqual || idDelta.hasAny(nextChange)
  if (!changed) {
    return {
      value: input.previous,
      change: nextChange
    }
  }

  return {
    value: {
      ids: nextIds,
      byId: nextById
    },
    change: nextChange,
    delta: entityDelta.fromChangeSet({
      changes: nextChange,
      order: !idsEqual
    })
  }
}
