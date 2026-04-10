import type {
  CommitTrace,
  EnginePerfApi,
  EnginePerfOptions,
  PerfCounter,
  PerfStats,
  ProjectStageName,
  RunningStat,
  StagePerfStats
} from '../types'

type PendingCommitTrace = Omit<CommitTrace, 'id'>

const PROJECT_STAGE_NAMES: readonly ProjectStageName[] = [
  'query',
  'sections',
  'calc'
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

const createPerfCounter = (): PerfCounter => ({
  total: 0,
  changed: 0,
  rebuilt: 0
})

const createStagePerfStats = (): StagePerfStats => ({
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

const createPerfStats = (): PerfStats => ({
  commits: {
    total: 0,
    dispatch: 0,
    undo: 0,
    redo: 0,
    replace: 0
  },
  timings: {
    totalMs: createRunningStat(),
    indexMs: createRunningStat(),
    projectMs: createRunningStat()
  },
  indexes: {
    records: createPerfCounter(),
    search: createPerfCounter(),
    group: createPerfCounter(),
    sort: createPerfCounter(),
    calculations: createPerfCounter()
  },
  stages: Object.fromEntries(
    PROJECT_STAGE_NAMES.map(stage => [stage, createStagePerfStats()] as const)
  ) as Record<ProjectStageName, StagePerfStats>
})

const clonePerfStats = (
  stats: PerfStats
): PerfStats => ({
  commits: {
    ...stats.commits
  },
  timings: {
    totalMs: cloneRunningStat(stats.timings.totalMs),
    indexMs: cloneRunningStat(stats.timings.indexMs),
    projectMs: cloneRunningStat(stats.timings.projectMs)
  },
  indexes: {
    records: { ...stats.indexes.records },
    search: { ...stats.indexes.search },
    group: { ...stats.indexes.group },
    sort: { ...stats.indexes.sort },
    calculations: { ...stats.indexes.calculations }
  },
  stages: Object.fromEntries(
    PROJECT_STAGE_NAMES.map(stage => [
      stage,
      {
        ...stats.stages[stage],
        duration: cloneRunningStat(stats.stages[stage].duration)
      }
    ] as const)
  ) as Record<ProjectStageName, StagePerfStats>
})

const cloneTrace = (
  trace: CommitTrace
): CommitTrace => ({
  id: trace.id,
  kind: trace.kind,
  timings: {
    ...trace.timings
  },
  delta: {
    summary: {
      ...trace.delta.summary
    },
    semantics: trace.delta.semantics.map(item => ({ ...item })),
    entities: {
      ...trace.delta.entities
    }
  },
  index: {
    changed: trace.index.changed,
    timings: {
      ...trace.index.timings
    },
    records: { ...trace.index.records },
    search: { ...trace.index.search },
    group: { ...trace.index.group },
    sort: { ...trace.index.sort },
    calculations: { ...trace.index.calculations }
  },
  project: {
    plan: {
      ...trace.project.plan
    },
    timings: {
      ...trace.project.timings
    },
    stages: trace.project.stages.map(stage => ({
      ...stage,
      ...(stage.metrics ? { metrics: { ...stage.metrics } } : {})
    }))
  },
  publish: {
    storeCount: trace.publish.storeCount,
    changedStores: [...trace.publish.changedStores]
  }
})

export interface PerfRuntime {
  enabled: boolean
  api: EnginePerfApi
  recordCommit: (trace: PendingCommitTrace) => void
}

export const createPerfRuntime = (
  options?: EnginePerfOptions
): PerfRuntime => {
  const traceEnabled = Boolean(options?.trace)
  const traceCapacity = typeof options?.trace === 'object'
    ? Math.max(1, options.trace.capacity ?? 50)
    : 50
  const statsEnabled = options?.stats === true
  const enabled = traceEnabled || statsEnabled
  let nextTraceId = 1
  let traces: CommitTrace[] = []
  let stats = createPerfStats()

  const api: EnginePerfApi = {
    trace: {
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
      snapshot: () => clonePerfStats(stats),
      clear: () => {
        stats = createPerfStats()
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

      if (traceEnabled) {
        traces.push(cloneTrace(nextTrace))
        if (traces.length > traceCapacity) {
          traces = traces.slice(traces.length - traceCapacity)
        }
      }

      if (!statsEnabled) {
        return
      }

      stats.commits.total += 1
      stats.commits[nextTrace.kind] += 1
      updateRunningStat(stats.timings.totalMs, nextTrace.timings.totalMs)
      updateRunningStat(stats.timings.indexMs, nextTrace.timings.indexMs)
      updateRunningStat(stats.timings.projectMs, nextTrace.timings.projectMs)

      ;(['records', 'search', 'group', 'sort', 'calculations'] as const).forEach(indexName => {
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

      nextTrace.project.stages.forEach(stage => {
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
