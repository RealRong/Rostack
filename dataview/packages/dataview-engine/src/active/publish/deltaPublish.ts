import {
  entityDelta,
  projectListChange,
  type EntityDelta
} from '@shared/delta'

export interface PublishedList<TId> {
  value: readonly TId[]
  delta?: EntityDelta<TId>
}

export interface PublishedStruct<TValue> {
  value: TValue
  reusedNodeCount: number
  rebuiltNodeCount: number
  changed: boolean
}

export const publishList = <TId>(input: {
  previous: readonly TId[]
  next: readonly TId[]
  set?: readonly TId[]
  remove?: readonly TId[]
}): PublishedList<TId> => {
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

export const publishStruct = <
  TValue extends object,
  TKey extends keyof TValue
>(input: {
  previous: TValue | undefined
  next: TValue
  keys: readonly TKey[]
}): PublishedStruct<TValue> => {
  if (!input.previous) {
    return {
      value: input.next,
      reusedNodeCount: 0,
      rebuiltNodeCount: input.keys.length,
      changed: true
    }
  }

  let reusedNodeCount = 0
  for (let index = 0; index < input.keys.length; index += 1) {
    const key = input.keys[index]!
    if (input.previous[key] === input.next[key]) {
      reusedNodeCount += 1
    }
  }

  const rebuiltNodeCount = input.keys.length - reusedNodeCount
  return {
    value: rebuiltNodeCount === 0
      ? input.previous
      : input.next,
    reusedNodeCount,
    rebuiltNodeCount,
    changed: rebuiltNodeCount > 0
  }
}
