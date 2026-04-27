type HistoryPortOptions = {
  limit?: number
  mergeWindowMs?: number
}

type TimestampedEntry = {
  at?: number
}

const isTimestampedEntry = (
  value: unknown
): value is TimestampedEntry => (
  typeof value === 'object'
  && value !== null
)

export const createEntryHistoryPort = <TEntry = unknown>(
  input: HistoryPortOptions = {}
) => {
  const limit = input.limit ?? Infinity
  const mergeWindowMs = input.mergeWindowMs ?? 0
  let entries: readonly TEntry[] = []

  return {
    read: (): readonly TEntry[] => entries,
    push: (entry: TEntry): void => {
      if (mergeWindowMs > 0 && entries.length > 0) {
        const previous = entries[entries.length - 1]
        if (isTimestampedEntry(previous) && isTimestampedEntry(entry)) {
          const previousAt = previous.at
          const nextAt = entry.at

          if (
            typeof previousAt === 'number'
            && typeof nextAt === 'number'
            && nextAt - previousAt <= mergeWindowMs
          ) {
            entries = [
              ...entries.slice(0, -1),
              entry
            ]
            return
          }
        }
      }

      const next = [...entries, entry]
      entries = next.length > limit
        ? next.slice(next.length - limit)
        : next
    }
  } as const
}
