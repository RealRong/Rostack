import {
  entityDelta,
  type EntityDelta
} from '../delta/entityDelta'
import {
  idDelta,
  type IdDelta
} from '../delta/idDelta'
import type { Action, Family } from '../contracts/core'
import { isListEqual } from './list'

const createEmptyChange = <TKey,>(): IdDelta<TKey> => idDelta.create<TKey>()

const filterPresentIds = <TKey>(
  ids: readonly TKey[],
  byId: ReadonlyMap<TKey, unknown>
): readonly TKey[] => ids.filter((id) => byId.has(id))

const resolveEntityAction = (
  changed: boolean
): Action => changed
  ? 'sync'
  : 'reuse'

export interface PublishedEntityFamily<TKey, TValue> {
  value: Family<TKey, TValue>
  change: IdDelta<TKey>
  delta?: EntityDelta<TKey>
  changed: boolean
  action: Action
}

export interface PublishedEntityList<TKey> {
  value: readonly TKey[]
  delta?: EntityDelta<TKey>
  changed: boolean
  action: Action
}

export const publishEntityList = <TKey>(input: {
  previous: readonly TKey[]
  next: readonly TKey[]
  set?: readonly TKey[]
  remove?: readonly TKey[]
}): PublishedEntityList<TKey> => {
  const orderChanged = !isListEqual(input.previous, input.next)
  const previousIdSet = new Set(input.previous)
  const nextIdSet = new Set(input.next)
  const delta = entityDelta.normalize({
    ...(orderChanged
      ? {
          order: true as const
        }
      : {}),
    set: [
      ...input.next.filter((id) => !previousIdSet.has(id)),
      ...(input.set ?? [])
    ],
    remove: [
      ...input.previous.filter((id) => !nextIdSet.has(id)),
      ...(input.remove ?? [])
    ]
  })

  return {
    value: orderChanged
      ? input.next
      : input.previous,
    delta,
    changed: Boolean(delta),
    action: resolveEntityAction(Boolean(delta))
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
      change: nextChange,
      action: 'reuse',
      changed: false
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
    }),
    changed: true,
    action: resolveEntityAction(true)
  }
}
