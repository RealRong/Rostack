export const unique = <T,>(
  values: readonly T[]
): T[] => Array.from(new Set(values))

export const uniqueBy = <T, K>(
  values: readonly T[],
  keyOf: (value: T) => K
): T[] => {
  const seen = new Set<K>()
  const next: T[] = []

  values.forEach(value => {
    const key = keyOf(value)
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    next.push(value)
  })

  return next
}

export const uniqueSorted = <T,>(
  values: readonly T[],
  compare?: (left: T, right: T) => number
): T[] => {
  const next = unique(values)
  return compare
    ? next.sort(compare)
    : next.sort()
}
