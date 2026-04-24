import type { IdChangeSet } from './changeSet'

export interface EntityDelta<TKey> {
  order?: true
  set?: readonly TKey[]
  remove?: readonly TKey[]
}

const sameOrder = <TKey>(
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

const unique = <TKey>(
  values: readonly TKey[]
): readonly TKey[] => [...new Set(values)]

export const normalize = <TKey>(
  delta: EntityDelta<TKey>
): EntityDelta<TKey> | undefined => {
  const remove = delta.remove
    ? unique(delta.remove)
    : undefined
  const removeSet = remove?.length
    ? new Set(remove)
    : undefined
  const set = delta.set
    ? unique(delta.set).filter((key) => !removeSet?.has(key))
    : undefined

  return delta.order || set?.length || remove?.length
    ? {
        ...(delta.order
          ? {
              order: true as const
            }
          : {}),
        ...(set?.length
          ? {
              set
            }
          : {}),
        ...(remove?.length
          ? {
              remove
            }
          : {})
      }
    : undefined
}

export const merge = <TKey>(
  ...deltas: readonly (EntityDelta<TKey> | undefined)[]
): EntityDelta<TKey> | undefined => normalize({
  order: deltas.some((delta) => delta?.order === true)
    ? true
    : undefined,
  set: deltas.flatMap((delta) => delta?.set ?? []),
  remove: deltas.flatMap((delta) => delta?.remove ?? [])
})

export const fromChangeSet = <TKey>(input: {
  changes: IdChangeSet<TKey>
  includeAdded?: boolean
  includeUpdated?: boolean
  includeRemoved?: boolean
  order?: boolean
}): EntityDelta<TKey> | undefined => {
  const { changes } = input
  const set: TKey[] = []
  const remove: TKey[] = []

  if (input.includeAdded ?? true) {
    changes.added.forEach((key) => {
      set.push(key)
    })
  }
  if (input.includeUpdated ?? true) {
    changes.updated.forEach((key) => {
      set.push(key)
    })
  }
  if (input.includeRemoved ?? true) {
    changes.removed.forEach((key) => {
      remove.push(key)
    })
  }

  return normalize({
    ...(input.order
      ? {
          order: true as const
        }
      : {}),
    set,
    remove
  })
}

export const fromSnapshots = <TKey, TValue>(input: {
  previousIds: readonly TKey[]
  nextIds: readonly TKey[]
  previousGet: (key: TKey) => TValue | undefined
  nextGet: (key: TKey) => TValue | undefined
  equal?: (left: TValue, right: TValue) => boolean
}): EntityDelta<TKey> | undefined => {
  const nextIdSet = new Set(input.nextIds)
  const set: TKey[] = []
  const remove: TKey[] = []
  const equal = input.equal ?? Object.is

  input.nextIds.forEach((key) => {
    const nextValue = input.nextGet(key)
    if (nextValue === undefined) {
      return
    }

    const previousValue = input.previousGet(key)
    if (previousValue === undefined || !equal(previousValue, nextValue)) {
      set.push(key)
    }
  })

  input.previousIds.forEach((key) => {
    if (!nextIdSet.has(key)) {
      remove.push(key)
    }
  })

  return normalize({
    ...(sameOrder(input.previousIds, input.nextIds)
      ? {}
      : {
          order: true as const
        }),
    set,
    remove
  })
}
