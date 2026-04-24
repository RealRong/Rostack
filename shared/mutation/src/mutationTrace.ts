export type MutationTraceCount = number | 'all'

export type TouchedCountInput =
  | MutationTraceCount
  | ReadonlySet<unknown>
  | ReadonlyMap<unknown, unknown>
  | undefined

export type FactCountInput =
  | TouchedCountInput
  | boolean

export interface MutationTraceFact {
  kind: string
  count?: number
}

export interface FactCounter {
  add(kind: string, count?: FactCountInput): void
  finish(): readonly MutationTraceFact[]
}

export interface MutationTrace<
  TSummary extends object,
  TEntities extends object
> {
  summary: TSummary
  facts: readonly MutationTraceFact[]
  entities: Partial<TEntities>
}

export interface MutationTraceBuilder<
  TSummary extends object,
  TEntities extends object
> {
  assignSummary(summary: Partial<TSummary>): void
  setSummary<TKey extends keyof TSummary>(
    key: TKey,
    value: TSummary[TKey]
  ): void
  setEntity<TKey extends keyof TEntities>(
    key: TKey,
    value: TEntities[TKey]
  ): void
  addFact(kind: string, count?: FactCountInput): void
  finish(): MutationTrace<TSummary, TEntities>
}

const toFactCount = (
  input: FactCountInput = true
): number => {
  if (typeof input === 'boolean') {
    return input
      ? 1
      : 0
  }

  const count = toTouchedCount(input)
  return count === 'all'
    ? 1
    : count ?? 0
}

const cleanupEntities = <TEntities extends object>(
  entities: TEntities
): Partial<TEntities> => {
  const next: Partial<TEntities> = {}

  ;(Object.keys(entities) as (keyof TEntities)[]).forEach((key) => {
    const value = entities[key]
    if (value !== undefined) {
      next[key] = value
    }
  })

  return next
}

export const toTouchedCount = (
  input: TouchedCountInput
): MutationTraceCount | undefined => {
  if (input === undefined) {
    return undefined
  }
  if (input === 'all') {
    return 'all'
  }
  if (typeof input === 'number') {
    return input > 0
      ? input
      : undefined
  }

  return input.size || undefined
}

export const hasTouchedCount = (
  input: MutationTraceCount | undefined
): boolean => input === 'all' || Boolean(input)

export const createFactCounter = (): FactCounter => {
  const counts = new Map<string, number>()

  return {
    add: (kind, count) => {
      const next = toFactCount(count)
      if (!next) {
        return
      }

      counts.set(kind, (counts.get(kind) ?? 0) + next)
    },
    finish: () => Array.from(counts.entries()).map(([kind, count]) => ({
      kind,
      ...(count > 1
        ? { count }
        : {})
    }))
  }
}

export const createMutationTrace = <
  TSummary extends object,
  TEntities extends object
>(input: {
  summary: TSummary
  entities: TEntities
}): MutationTraceBuilder<TSummary, TEntities> => {
  const summary = {
    ...input.summary
  }
  const entities = {
    ...input.entities
  }
  const facts = createFactCounter()

  return {
    assignSummary: (nextSummary) => {
      Object.assign(summary, nextSummary)
    },
    setSummary: (key, value) => {
      summary[key] = value
    },
    setEntity: (key, value) => {
      entities[key] = value
    },
    addFact: (kind, count) => {
      facts.add(kind, count)
    },
    finish: () => ({
      summary: {
        ...summary
      },
      facts: facts.finish(),
      entities: cleanupEntities(entities)
    })
  }
}
