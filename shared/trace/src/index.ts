export type TraceCount = number | 'all'

export type TraceCountInput =
  | TraceCount
  | ReadonlySet<unknown>
  | ReadonlyMap<unknown, unknown>
  | undefined

export type TraceSpec = {
  summary?: Record<string, 'flag'>
  entities?: Record<string, 'count' | 'value'>
}

export type TraceFact = {
  kind: string
  count?: number
}

type TraceSummarySpec = NonNullable<TraceSpec['summary']>
type TraceEntitiesSpec = NonNullable<TraceSpec['entities']>

type TraceSummaryOf<TSpec extends TraceSpec> = TSpec extends {
  summary: infer TSummary extends TraceSummarySpec
}
  ? {
      [K in keyof TSummary]: boolean
    }
  : {}

type TraceEntitiesOf<TSpec extends TraceSpec> = TSpec extends {
  entities: infer TEntities extends TraceEntitiesSpec
}
  ? {
      [K in keyof TEntities]:
        TEntities[K] extends 'count'
          ? TraceCount | undefined
          : unknown
    }
  : {}

export type TraceSnapshot<
  TSummary extends Record<string, unknown>,
  TEntities extends Record<string, unknown>
> = {
  summary: TSummary
  facts: readonly TraceFact[]
  entities: Partial<TEntities>
}

interface TraceBuilder<
  TSummary extends Record<string, unknown>,
  TEntities extends Record<string, unknown>
> {
  assignSummary(summary: Partial<TSummary>): void
  setSummary<TKey extends keyof TSummary>(key: TKey, value: TSummary[TKey]): void
  setEntity<TKey extends keyof TEntities>(key: TKey, value: TEntities[TKey]): void
  addFact(kind: string, count?: boolean | TraceCountInput): void
  finish(): TraceSnapshot<TSummary, TEntities>
}

const cloneSummary = <TSpec extends TraceSpec>(
  spec: TSpec,
  summary: TraceSummaryOf<TSpec>
): TraceSummaryOf<TSpec> => {
  const next = {} as TraceSummaryOf<TSpec>
  const keys = Object.keys(spec.summary ?? {}) as Array<keyof TraceSummaryOf<TSpec>>

  keys.forEach((key) => {
    next[key] = summary[key]
  })

  return next
}

const cloneEntities = <TSpec extends TraceSpec>(
  spec: TSpec,
  entities: TraceEntitiesOf<TSpec>
): TraceEntitiesOf<TSpec> => {
  const next = {} as TraceEntitiesOf<TSpec>
  const keys = Object.keys(spec.entities ?? {}) as Array<keyof TraceEntitiesOf<TSpec>>

  keys.forEach((key) => {
    next[key] = entities[key]
  })

  return next
}

const cleanupEntities = <TEntities extends Record<string, unknown>>(
  entities: TEntities
): Partial<TEntities> => {
  const next: Partial<TEntities> = {}

  ;(Object.keys(entities) as Array<keyof TEntities>).forEach((key) => {
    const value = entities[key]
    if (value !== undefined) {
      next[key] = value
    }
  })

  return next
}

const toFactCount = (
  input: boolean | TraceCountInput = true
): number => {
  if (typeof input === 'boolean') {
    return input
      ? 1
      : 0
  }

  const count = trace.count(input)
  return count === 'all'
    ? 1
    : count ?? 0
}

export const trace = {
  count: (
    input: TraceCountInput
  ): TraceCount | undefined => {
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
  },
  has: (input: TraceCount | undefined): boolean => input === 'all' || Boolean(input),
  create: <
    const TSpec extends TraceSpec
  >(input: {
    spec: TSpec
    summary: TraceSummaryOf<TSpec>
    entities: TraceEntitiesOf<TSpec>
  }): TraceBuilder<TraceSummaryOf<TSpec>, TraceEntitiesOf<TSpec>> => {
    const summary = cloneSummary(input.spec, input.summary)
    const entities = cloneEntities(input.spec, input.entities)
    const facts = new Map<string, number>()

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
        const next = toFactCount(count)
        if (!next) {
          return
        }

        facts.set(kind, (facts.get(kind) ?? 0) + next)
      },
      finish: () => ({
        summary: {
          ...summary
        },
        facts: Array.from(facts.entries()).map(([kind, count]) => ({
          kind,
          ...(count > 1
            ? { count }
            : {})
        })),
        entities: cleanupEntities(entities)
      })
    }
  }
} as const
