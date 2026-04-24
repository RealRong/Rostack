import type { Flags, Ids } from '../contracts/core'

export const createFlags = (
  changed: boolean
): Flags => ({
  changed
})

export const mergeFlags = (
  ...flags: readonly (Flags | boolean | undefined)[]
): Flags => ({
  changed: flags.some((flag) => (
    typeof flag === 'boolean'
      ? flag
      : flag?.changed === true
  ))
})

export const createIds = <TKey>(
  values?: Iterable<TKey>
): Ids<TKey> => ({
  all: new Set(values ?? [])
})

export const mergeIds = <TKey>(
  ...values: readonly (Ids<TKey> | Iterable<TKey> | undefined)[]
): Ids<TKey> => {
  const merged = new Set<TKey>()

  values.forEach((entry) => {
    if (!entry) {
      return
    }

    const iterable = 'all' in entry
      ? entry.all
      : entry

    for (const value of iterable) {
      merged.add(value)
    }
  })

  return {
    all: merged
  }
}

export const idsChanged = <TKey>(
  ids: Ids<TKey>
): Flags => ({
  changed: ids.all.size > 0
})
