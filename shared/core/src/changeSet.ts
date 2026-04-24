export interface IdChangeSet<TKey> {
  added: Set<TKey>
  updated: Set<TKey>
  removed: Set<TKey>
}

export const create = <TKey,>(): IdChangeSet<TKey> => ({
  added: new Set<TKey>(),
  updated: new Set<TKey>(),
  removed: new Set<TKey>()
})

export const reset = <TKey>(
  changeSet: IdChangeSet<TKey>
): void => {
  changeSet.added.clear()
  changeSet.updated.clear()
  changeSet.removed.clear()
}

export const markAdded = <TKey>(
  changeSet: IdChangeSet<TKey>,
  key: TKey
): void => {
  changeSet.removed.delete(key)
  changeSet.updated.delete(key)
  changeSet.added.add(key)
}

export const markUpdated = <TKey>(
  changeSet: IdChangeSet<TKey>,
  key: TKey
): void => {
  if (changeSet.added.has(key) || changeSet.removed.has(key)) {
    return
  }

  changeSet.updated.add(key)
}

export const markRemoved = <TKey>(
  changeSet: IdChangeSet<TKey>,
  key: TKey
): void => {
  if (changeSet.added.delete(key)) {
    changeSet.updated.delete(key)
    return
  }

  changeSet.updated.delete(key)
  changeSet.removed.add(key)
}

export const hasAny = <TKey>(
  changeSet: IdChangeSet<TKey>
): boolean => {
  return (
    changeSet.added.size > 0
    || changeSet.updated.size > 0
    || changeSet.removed.size > 0
  )
}

export const touched = <TKey>(
  changeSet: IdChangeSet<TKey>
): ReadonlySet<TKey> => {
  return new Set<TKey>([
    ...changeSet.added,
    ...changeSet.updated,
    ...changeSet.removed
  ])
}

export const clone = <TKey>(
  changeSet: IdChangeSet<TKey>
): IdChangeSet<TKey> => ({
  added: new Set(changeSet.added),
  updated: new Set(changeSet.updated),
  removed: new Set(changeSet.removed)
})

export const assign = <TKey>(
  target: IdChangeSet<TKey>,
  source: IdChangeSet<TKey>
): IdChangeSet<TKey> => {
  if (target === source) {
    return target
  }

  reset(target)
  source.added.forEach((key) => {
    target.added.add(key)
  })
  source.updated.forEach((key) => {
    target.updated.add(key)
  })
  source.removed.forEach((key) => {
    target.removed.add(key)
  })

  return target
}
