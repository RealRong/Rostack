const EMPTY_VALUES = new Set<never>() as ReadonlySet<never>

export const empty = <T,>(): ReadonlySet<T> => EMPTY_VALUES as ReadonlySet<T>

export const same = <T,>(
  left: ReadonlySet<T>,
  right: ReadonlySet<T>
) => {
  if (left === right) {
    return true
  }

  if (left.size !== right.size) {
    return false
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false
    }
  }

  return true
}

export const intersects = <T,>(
  left: ReadonlySet<T>,
  right: ReadonlySet<T>
) => {
  const scan = left.size <= right.size
    ? left
    : right
  const match = scan === left
    ? right
    : left

  for (const value of scan) {
    if (match.has(value)) {
      return true
    }
  }

  return false
}

export const intersectsValues = <T,>(
  values: Iterable<T>,
  set: ReadonlySet<T>
) => {
  for (const value of values) {
    if (set.has(value)) {
      return true
    }
  }

  return false
}

export const addAll = <T,>(
  source: ReadonlySet<T>,
  values: Iterable<T>
): Set<T> => {
  const next = new Set(source)
  for (const value of values) {
    next.add(value)
  }
  return next
}

export const removeAll = <T,>(
  source: ReadonlySet<T>,
  values: Iterable<T>
): Set<T> => {
  const next = new Set(source)
  for (const value of values) {
    next.delete(value)
  }
  return next
}

export const toggleAll = <T,>(
  source: ReadonlySet<T>,
  values: Iterable<T>
): Set<T> => {
  const next = new Set(source)
  for (const value of values) {
    if (next.has(value)) {
      next.delete(value)
      continue
    }

    next.add(value)
  }
  return next
}
