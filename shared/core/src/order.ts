export const normalizeExistingIds = <T,>(
  ids: readonly T[] | undefined,
  valid: ReadonlySet<T>
): T[] => {
  if (!ids?.length) {
    return []
  }

  const normalized: T[] = []
  const seen = new Set<T>()

  ids.forEach(id => {
    if (!valid.has(id) || seen.has(id)) {
      return
    }

    seen.add(id)
    normalized.push(id)
  })

  return normalized
}

export const applyPreferredOrder = <T,>(
  ids: readonly T[],
  orderedIds: readonly T[]
): T[] => {
  if (!orderedIds.length) {
    return [...ids]
  }

  const orderedIdSet = new Set(orderedIds)
  return [
    ...orderedIds,
    ...ids.filter(id => !orderedIdSet.has(id))
  ]
}

export const moveItem = <T,>(
  ids: readonly T[],
  target: T,
  options: {
    before?: T
  } = {}
): T[] => {
  const filtered = ids.filter(id => id !== target)
  let insertIndex = filtered.length

  if (options.before !== undefined && options.before !== target) {
    const beforeIndex = filtered.indexOf(options.before)
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex
    }
  }

  return [
    ...filtered.slice(0, insertIndex),
    target,
    ...filtered.slice(insertIndex)
  ]
}

export const moveAt = <T,>(
  values: readonly T[],
  from: number,
  to: number
): T[] => {
  if (
    from < 0
    || to < 0
    || from >= values.length
    || to >= values.length
  ) {
    return [...values]
  }

  if (from === to) {
    return [...values]
  }

  const next = [...values]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) {
    return [...values]
  }

  next.splice(to, 0, moved)
  return next
}

export const splice = <T,>(
  ids: readonly T[],
  targets: readonly T[],
  options: {
    before?: T
  } = {}
): T[] => {
  const movingSet = new Set(targets)
  const block = ids.filter(id => movingSet.has(id))

  if (!block.length) {
    return [...ids]
  }

  if (options.before !== undefined && movingSet.has(options.before)) {
    return [...ids]
  }

  const remaining = ids.filter(id => !movingSet.has(id))
  let insertIndex = remaining.length

  if (options.before !== undefined) {
    const beforeIndex = remaining.indexOf(options.before)
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex
    }
  }

  return [
    ...remaining.slice(0, insertIndex),
    ...block,
    ...remaining.slice(insertIndex)
  ]
}
