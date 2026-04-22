export const createReadonlySet = <T>(
  values?: Iterable<T>
): ReadonlySet<T> => new Set(values ?? [])

export const mergeReadonlySets = <T>(
  ...sets: readonly (ReadonlySet<T> | undefined)[]
): ReadonlySet<T> => {
  const merged = new Set<T>()

  sets.forEach((set) => {
    set?.forEach((value) => {
      merged.add(value)
    })
  })

  return merged
}

export const isReadonlySetEmpty = <T>(
  values?: ReadonlySet<T>
): boolean => !values || values.size === 0
