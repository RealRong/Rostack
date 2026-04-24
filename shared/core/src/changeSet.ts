export interface IdChangeSet<TKey> {
  added: Set<TKey>
  updated: Set<TKey>
  removed: Set<TKey>
}

export interface LegacyIdChangeSet<TKey> {
  add: Set<TKey>
  update: Set<TKey>
  delete: Set<TKey>
}

export type AnyIdChangeSet<TKey> =
  | IdChangeSet<TKey>
  | LegacyIdChangeSet<TKey>

export type ChangeKind =
  | 'add'
  | 'update'
  | 'delete'
  | 'added'
  | 'updated'
  | 'removed'

const isCanonical = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
): changeSet is IdChangeSet<TKey> => 'added' in changeSet

const readSets = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
) => isCanonical(changeSet)
  ? {
      added: changeSet.added,
      updated: changeSet.updated,
      removed: changeSet.removed
    }
  : {
      added: changeSet.add,
      updated: changeSet.update,
      removed: changeSet.delete
    }

export const create = <TKey,>(): IdChangeSet<TKey> => ({
  added: new Set<TKey>(),
  updated: new Set<TKey>(),
  removed: new Set<TKey>()
})

export const createLegacy = <TKey,>(): LegacyIdChangeSet<TKey> => ({
  add: new Set<TKey>(),
  update: new Set<TKey>(),
  delete: new Set<TKey>()
})

export const reset = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
): void => {
  const sets = readSets(changeSet)
  sets.added.clear()
  sets.updated.clear()
  sets.removed.clear()
}

export const markAdded = <TKey>(
  changeSet: AnyIdChangeSet<TKey>,
  key: TKey
): void => {
  const sets = readSets(changeSet)
  sets.removed.delete(key)
  sets.updated.delete(key)
  sets.added.add(key)
}

export const markUpdated = <TKey>(
  changeSet: AnyIdChangeSet<TKey>,
  key: TKey
): void => {
  const sets = readSets(changeSet)
  if (sets.added.has(key) || sets.removed.has(key)) {
    return
  }

  sets.updated.add(key)
}

export const markRemoved = <TKey>(
  changeSet: AnyIdChangeSet<TKey>,
  key: TKey
): void => {
  const sets = readSets(changeSet)
  if (sets.added.delete(key)) {
    sets.updated.delete(key)
    return
  }

  sets.updated.delete(key)
  sets.removed.add(key)
}

export const mark = <TKey>(
  changeSet: AnyIdChangeSet<TKey>,
  kind: ChangeKind,
  key: TKey
): void => {
  switch (kind) {
    case 'add':
    case 'added':
      markAdded(changeSet, key)
      return
    case 'update':
    case 'updated':
      markUpdated(changeSet, key)
      return
    case 'delete':
    case 'removed':
      markRemoved(changeSet, key)
  }
}

export const hasAny = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
): boolean => {
  const sets = readSets(changeSet)
  return (
    sets.added.size > 0
    || sets.updated.size > 0
    || sets.removed.size > 0
  )
}

export const touched = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
): ReadonlySet<TKey> => {
  const sets = readSets(changeSet)
  return new Set<TKey>([
    ...sets.added,
    ...sets.updated,
    ...sets.removed
  ])
}

export const clone = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
): AnyIdChangeSet<TKey> => isCanonical(changeSet)
  ? {
      added: new Set(changeSet.added),
      updated: new Set(changeSet.updated),
      removed: new Set(changeSet.removed)
    }
  : {
      add: new Set(changeSet.add),
      update: new Set(changeSet.update),
      delete: new Set(changeSet.delete)
    }

export const assign = <TKey>(
  target: AnyIdChangeSet<TKey>,
  source: AnyIdChangeSet<TKey>
): AnyIdChangeSet<TKey> => {
  const sourceSets = target === source
    ? toCanonical(source)
    : readSets(source)

  reset(target)

  const targetSets = readSets(target)

  sourceSets.added.forEach((key) => {
    targetSets.added.add(key)
  })
  sourceSets.updated.forEach((key) => {
    targetSets.updated.add(key)
  })
  sourceSets.removed.forEach((key) => {
    targetSets.removed.add(key)
  })

  return target
}

export const toCanonical = <TKey>(
  changeSet: AnyIdChangeSet<TKey>
): IdChangeSet<TKey> => {
  const sets = readSets(changeSet)
  return {
    added: new Set(sets.added),
    updated: new Set(sets.updated),
    removed: new Set(sets.removed)
  }
}
