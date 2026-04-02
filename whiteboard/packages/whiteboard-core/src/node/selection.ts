export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle'

export const applySelection = <T>(
  prevSelectedIds: Set<T>,
  ids: T[],
  mode: SelectionMode
): Set<T> => {
  if (mode === 'replace') {
    return new Set(ids)
  }

  const next = new Set(prevSelectedIds)
  if (mode === 'add') {
    ids.forEach((id) => next.add(id))
    return next
  }

  if (mode === 'subtract') {
    ids.forEach((id) => next.delete(id))
    return next
  }

  ids.forEach((id) => {
    if (next.has(id)) {
      next.delete(id)
      return
    }
    next.add(id)
  })
  return next
}
