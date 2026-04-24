export interface IdDelta<TKey> {
  added: Set<TKey>
  updated: Set<TKey>
  removed: Set<TKey>
}

export const create = <TKey,>(): IdDelta<TKey> => ({
  added: new Set<TKey>(),
  updated: new Set<TKey>(),
  removed: new Set<TKey>()
})

export const reset = <TKey>(
  delta: IdDelta<TKey>
): void => {
  delta.added.clear()
  delta.updated.clear()
  delta.removed.clear()
}

export const add = <TKey>(
  delta: IdDelta<TKey>,
  key: TKey
): void => {
  delta.removed.delete(key)
  delta.updated.delete(key)
  delta.added.add(key)
}

export const update = <TKey>(
  delta: IdDelta<TKey>,
  key: TKey
): void => {
  if (delta.added.has(key) || delta.removed.has(key)) {
    return
  }

  delta.updated.add(key)
}

export const remove = <TKey>(
  delta: IdDelta<TKey>,
  key: TKey
): void => {
  if (delta.added.delete(key)) {
    delta.updated.delete(key)
    return
  }

  delta.updated.delete(key)
  delta.removed.add(key)
}

export const hasAny = <TKey>(
  delta: IdDelta<TKey>
): boolean => {
  return (
    delta.added.size > 0
    || delta.updated.size > 0
    || delta.removed.size > 0
  )
}

export const touched = <TKey>(
  delta: IdDelta<TKey>
): ReadonlySet<TKey> => {
  return new Set<TKey>([
    ...delta.added,
    ...delta.updated,
    ...delta.removed
  ])
}

export const clone = <TKey>(
  delta: IdDelta<TKey>
): IdDelta<TKey> => ({
  added: new Set(delta.added),
  updated: new Set(delta.updated),
  removed: new Set(delta.removed)
})

export const assign = <TKey>(
  target: IdDelta<TKey>,
  source: IdDelta<TKey>
): IdDelta<TKey> => {
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

export const idDelta = {
  create,
  reset,
  add,
  update,
  remove,
  hasAny,
  touched,
  clone,
  assign
} as const
