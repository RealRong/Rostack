import { metrics } from '@shared/core'
import {
  mutationTrace
} from '@shared/mutation'
import {
  dataviewTrace,
  type DataviewTrace
} from '@dataview/core/mutation'
import type {
  Origin
} from '@shared/mutation'
import type {
  CommitTrace,
  PerformanceApi,
  PerformanceCounter,
  PerformanceOptions,
  PerformanceStats,
  StagePerformanceStats,
  TraceImpactSummary,
  ViewStageName
} from '@dataview/engine/contracts/performance'

type PendingCommitTrace = Omit<CommitTrace, 'id'>

export const summarizeTrace = (
  trace: DataviewTrace
): TraceImpactSummary => {
  const summary = mutationTrace.createMutationTrace<
    TraceImpactSummary['summary'],
    TraceImpactSummary['entities']
  >({
    summary: {
      ...dataviewTrace.summary(trace),
      indexes: false
    },
    entities: {
      touchedRecordCount: undefined,
      touchedFieldCount: undefined,
      touchedViewCount: undefined
    }
  })

  summary.setSummary('indexes', dataviewTrace.has.index(trace))
  summary.addFact('record.insert', trace.records?.inserted)
  summary.addFact('record.remove', trace.records?.removed)
  summary.addFact('record.patch', trace.records?.patched)
  summary.addFact('record.value', trace.values?.touched)
  summary.addFact('field.insert', trace.fields?.inserted)
  summary.addFact('field.remove', trace.fields?.removed)
  summary.addFact('field.schema', trace.fields?.schema)
  summary.addFact('view.insert', trace.views?.inserted)
  summary.addFact('view.remove', trace.views?.removed)
  summary.addFact('view.change', trace.views?.changed)
  summary.addFact('activeView.set', Boolean(trace.activeView))
  summary.addFact('external.version.bump', Boolean(trace.external?.versionBumped))
  summary.addFact('reset', Boolean(trace.reset))
  summary.setEntity('touchedRecordCount', dataviewTrace.record.touchedCount(trace))
  summary.setEntity('touchedFieldCount', dataviewTrace.field.touchedCount(trace))
  summary.setEntity('touchedViewCount', dataviewTrace.view.touchedCount(trace))

  return summary.finish()
}

export const toPerformanceKind = (
  origin: Origin
): 'dispatch' | 'undo' | 'redo' | 'replace' => {
  switch (origin) {
    case 'history':
      return 'undo'
    case 'load':
      return 'replace'
    default:
      return 'dispatch'
  }
}

const VIEW_STAGE_NAMES: readonly ViewStageName[] = [
  'query',
  'membership',
  'summary',
  'publish'
]

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
  duration: metrics.createRunningStat()
})

const createPerformanceStats = (): PerformanceStats => ({
  commits: {
    total: 0,
    dispatch: 0,
    undo: 0,
    redo: 0,
    replace: 0
  },
  timings: {
    totalMs: metrics.createRunningStat(),
    planMs: metrics.createRunningStat(),
    indexMs: metrics.createRunningStat(),
    viewMs: metrics.createRunningStat(),
    outputMs: metrics.createRunningStat()
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
    totalMs: metrics.cloneRunningStat(stats.timings.totalMs),
    planMs: metrics.cloneRunningStat(stats.timings.planMs),
    indexMs: metrics.cloneRunningStat(stats.timings.indexMs),
    viewMs: metrics.cloneRunningStat(stats.timings.viewMs),
    outputMs: metrics.cloneRunningStat(stats.timings.outputMs)
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
        duration: metrics.cloneRunningStat(stats.stages[stage].duration)
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
      metrics.updateRunningStat(stats.timings.totalMs, nextTrace.timings.totalMs)
      metrics.updateRunningStat(stats.timings.planMs, nextTrace.timings.planMs)
      metrics.updateRunningStat(stats.timings.indexMs, nextTrace.timings.indexMs)
      metrics.updateRunningStat(stats.timings.viewMs, nextTrace.timings.viewMs)
      metrics.updateRunningStat(stats.timings.outputMs, nextTrace.timings.outputMs)

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
        metrics.updateRunningStat(target.duration, stage.durationMs)
      })
    }
  }
}
