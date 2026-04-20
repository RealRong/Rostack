import type {
  CommitTrace,
  PerformanceApi,
  PerformanceCounter,
  PerformanceOptions,
  PerformanceStats,
  RunningStat,
  StagePerformanceStats,
  ViewStageName
} from '@dataview/engine/contracts/public'

type PendingCommitTrace = Omit<CommitTrace, 'id'>

const VIEW_STAGE_NAMES: readonly ViewStageName[] = [
  'query',
  'sections',
  'summary'
]

const cloneRunningStat = (
  stat: RunningStat
): RunningStat => ({
  count: stat.count,
  total: stat.total,
  avg: stat.avg,
  max: stat.max,
  ...(stat.p95 === undefined ? {} : { p95: stat.p95 })
})

const createRunningStat = (): RunningStat => ({
  count: 0,
  total: 0,
  avg: 0,
  max: 0
})

const createPerformanceCounter = (): PerformanceCounter => ({
  total: 0,
  changed: 0,
  rebuilt: 0
})

const createStagePerformanceStats = (): StagePerformanceStats => ({
  total: 0,
  reuse: 0,
  sync: 0,
  rebuild: 0,
  changed: 0,
  duration: createRunningStat()
})

const updateRunningStat = (
  stat: RunningStat,
  value: number | undefined
) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return
  }

  stat.count += 1
  stat.total += value
  stat.avg = stat.total / stat.count
  stat.max = Math.max(stat.max, value)
}

const createPerformanceStats = (): PerformanceStats => ({
  commits: {
    total: 0,
    dispatch: 0,
    undo: 0,
    redo: 0,
    replace: 0
  },
  timings: {
    totalMs: createRunningStat(),
    planMs: createRunningStat(),
    indexMs: createRunningStat(),
    viewMs: createRunningStat(),
    outputMs: createRunningStat()
  },
  indexes: {
    records: createPerformanceCounter(),
    search: createPerformanceCounter(),
    bucket: createPerformanceCounter(),
    sort: createPerformanceCounter(),
    summaries: createPerformanceCounter()
  },
  stages: Object.fromEntries(
    VIEW_STAGE_NAMES.map(stage => [stage, createStagePerformanceStats()] as const)
  ) as Record<ViewStageName, StagePerformanceStats>
})

const clonePerformanceStats = (
  stats: PerformanceStats
): PerformanceStats => ({
  commits: {
    ...stats.commits
  },
  timings: {
    totalMs: cloneRunningStat(stats.timings.totalMs),
    planMs: cloneRunningStat(stats.timings.planMs),
    indexMs: cloneRunningStat(stats.timings.indexMs),
    viewMs: cloneRunningStat(stats.timings.viewMs),
    outputMs: cloneRunningStat(stats.timings.outputMs)
  },
  indexes: {
    records: { ...stats.indexes.records },
    search: { ...stats.indexes.search },
    bucket: { ...stats.indexes.bucket },
    sort: { ...stats.indexes.sort },
    summaries: { ...stats.indexes.summaries }
  },
  stages: Object.fromEntries(
    VIEW_STAGE_NAMES.map(stage => [
      stage,
      {
        ...stats.stages[stage],
        duration: cloneRunningStat(stats.stages[stage].duration)
      }
    ] as const)
  ) as Record<ViewStageName, StagePerformanceStats>
})

const cloneTrace = (
  trace: CommitTrace
): CommitTrace => ({
  id: trace.id,
  kind: trace.kind,
  timings: {
    ...trace.timings
  },
  impact: {
    summary: {
      ...trace.impact.summary
    },
    facts: trace.impact.facts.map(item => ({ ...item })),
    entities: {
      ...trace.impact.entities
    }
  },
  index: {
    changed: trace.index.changed,
    timings: {
      ...trace.index.timings
    },
    records: { ...trace.index.records },
    search: { ...trace.index.search },
    bucket: { ...trace.index.bucket },
    sort: { ...trace.index.sort },
    summaries: { ...trace.index.summaries }
  },
  view: {
    plan: {
      ...trace.view.plan
    },
    timings: {
      ...trace.view.timings
    },
    stages: trace.view.stages.map(stage => ({
      ...stage,
      deriveMs: stage.deriveMs,
      publishMs: stage.publishMs,
      ...(stage.metrics ? { metrics: { ...stage.metrics } } : {})
    }))
  },
  snapshot: {
    storeCount: trace.snapshot.storeCount,
    changedStores: [...trace.snapshot.changedStores]
  }
})

export interface PerformanceRuntime {
  enabled: boolean
  api: PerformanceApi
  recordCommit: (trace: PendingCommitTrace) => void
}

export const createPerformanceRuntime = (
  options?: PerformanceOptions
): PerformanceRuntime => {
  const tracesEnabled = Boolean(options?.traces)
  const tracesCapacity = typeof options?.traces === 'object'
    ? Math.max(1, options.traces.capacity ?? 50)
    : 50
  const statsEnabled = options?.stats === true
  const enabled = tracesEnabled || statsEnabled
  let nextTraceId = 1
  let traces: CommitTrace[] = []
  let stats = createPerformanceStats()

  const api: PerformanceApi = {
    traces: {
      last: () => {
        const trace = traces.at(-1)
        return trace
          ? cloneTrace(trace)
          : undefined
      },
      list: limit => (
        typeof limit === 'number'
          ? traces
              .slice(Math.max(0, traces.length - Math.max(0, limit)))
              .map(cloneTrace)
          : traces.map(cloneTrace)
      ),
      clear: () => {
        traces = []
      }
    },
    stats: {
      snapshot: () => clonePerformanceStats(stats),
      clear: () => {
        stats = createPerformanceStats()
      }
    }
  }

  return {
    enabled,
    api,
    recordCommit: trace => {
      const nextTrace: CommitTrace = {
        id: nextTraceId,
        ...trace
      }
      nextTraceId += 1

      if (tracesEnabled) {
        traces.push(cloneTrace(nextTrace))
        if (traces.length > tracesCapacity) {
          traces = traces.slice(traces.length - tracesCapacity)
        }
      }

      if (!statsEnabled) {
        return
      }

      stats.commits.total += 1
      stats.commits[nextTrace.kind] += 1
      updateRunningStat(stats.timings.totalMs, nextTrace.timings.totalMs)
      updateRunningStat(stats.timings.planMs, nextTrace.timings.planMs)
      updateRunningStat(stats.timings.indexMs, nextTrace.timings.indexMs)
      updateRunningStat(stats.timings.viewMs, nextTrace.timings.viewMs)
      updateRunningStat(stats.timings.outputMs, nextTrace.timings.outputMs)

      ;(['records', 'search', 'bucket', 'sort', 'summaries'] as const).forEach(indexName => {
        const counter = stats.indexes[indexName]
        const stage = nextTrace.index[indexName]
        counter.total += 1
        if (stage.changed) {
          counter.changed += 1
        }
        if (stage.action === 'rebuild') {
          counter.rebuilt += 1
        }
      })

      nextTrace.view.stages.forEach(stage => {
        const target = stats.stages[stage.stage]
        target.total += 1
        target[stage.action] += 1
        if (stage.changed) {
          target.changed += 1
        }
        updateRunningStat(target.duration, stage.durationMs)
      })
    }
  }
}
