import { metrics } from '@shared/core'
import {
  createDataviewQueryContext,
  dataviewMutationSchema,
  type DataviewMutationDelta
} from '@dataview/core/mutation'
import type {
  CommitTrace,
  PerformanceApi,
  PerformanceCounter,
  PerformanceOptions,
  PerformanceStats,
  StagePerformanceStats,
  TraceDeltaSummary,
  ViewStageName
} from '@dataview/engine/contracts/performance'
import type {
  EngineCommit
} from '@dataview/engine/contracts/write'

type PendingCommitTrace = Omit<CommitTrace, 'id'>

const countTouched = <T,>(
  value: ReadonlySet<T> | 'all'
): number | 'all' => value === 'all'
  ? 'all'
  : value.size

const countWrites = (input: {
  delta: DataviewMutationDelta
  match(write: ReturnType<DataviewMutationDelta['writes']>[number]): boolean
}): number | 'all' | undefined => {
  if (input.delta.reset()) {
    return 'all'
  }

  let count = 0
  input.delta.writes().forEach((write) => {
    if (input.match(write)) {
      count += 1
    }
  })
  return count > 0
    ? count
    : undefined
}

const summarizeTypedDelta = (
  commit: EngineCommit
): TraceDeltaSummary => {
  const delta = commit.delta as DataviewMutationDelta
  const query = createDataviewQueryContext(commit.document).query
  const changes = query.changes(delta)
  const nodes = dataviewMutationSchema.shape
  const facts: Array<{
    kind: string
    count?: number
  }> = []
  const pushFact = (
    kind: string,
    count: number | 'all' | undefined
  ) => {
    if (count === undefined) {
      return
    }

    facts.push({
      kind,
      ...(typeof count === 'number'
        ? { count }
        : {})
    })
  }

  const touchedRecords = changes.touchedRecords()
  const touchedFields = changes.touchedFields()
  const touchedViews = changes.view.touchedIds()
  const schemaTouchedFields = changes.fieldSchemaTouchedIds()
  const activeViewId = query.views.activeId()

  pushFact('record.insert', countWrites({
    delta,
    match: (write) => write.kind === 'entity.create' && write.node === nodes.records
  }))
  pushFact('record.title', countWrites({
    delta,
    match: (write) => write.node === nodes.records.shape.title
  }))
  pushFact('record.type', countWrites({
    delta,
    match: (write) => write.node === nodes.records.shape.type
  }))
  pushFact('record.meta', countWrites({
    delta,
    match: (write) => write.node === nodes.records.shape.meta
  }))
  pushFact('record.remove', countWrites({
    delta,
    match: (write) => write.kind === 'entity.remove' && write.node === nodes.records
  }))
  pushFact('record.value', countWrites({
    delta,
    match: (write) => write.node === nodes.records.shape.values
  }))
  pushFact('field.insert', countWrites({
    delta,
    match: (write) => write.kind === 'entity.create' && write.node === nodes.fields
  }))
  pushFact('field.remove', countWrites({
    delta,
    match: (write) => write.kind === 'entity.remove' && write.node === nodes.fields
  }))
  pushFact('field.schema', countTouched(schemaTouchedFields))
  pushFact('view.insert', countWrites({
    delta,
    match: (write) => write.kind === 'entity.create' && write.node === nodes.views
  }))
  pushFact('view.change', countTouched(touchedViews))
  pushFact('view.layout', countWrites({
    delta,
    match: (write) => (
      write.node === nodes.views.shape.name
      || write.node === nodes.views.shape.type
      || write.node === nodes.views.shape.fields
      || write.node === nodes.views.shape.options
    )
  }))
  pushFact('view.calc', countWrites({
    delta,
    match: (write) => write.node === nodes.views.shape.calc
  }))
  pushFact('view.remove', countWrites({
    delta,
    match: (write) => write.kind === 'entity.remove' && write.node === nodes.views
  }))
  pushFact('activeView.set', delta.document.activeViewId.changed() ? 1 : undefined)
  pushFact('reset', delta.reset() ? 1 : undefined)

  return {
    summary: {
      records: touchedRecords === 'all' || touchedRecords.size > 0,
      fields: touchedFields === 'all' || touchedFields.size > 0,
      views: touchedViews === 'all' || touchedViews.size > 0,
      activeView: delta.document.activeViewId.changed(),
      external: false,
      indexes: touchedRecords === 'all'
        || touchedRecords.size > 0
        || schemaTouchedFields === 'all'
        || schemaTouchedFields.size > 0
        || (activeViewId !== undefined && changes.view.queryChanged(activeViewId))
        || countWrites({
          delta,
          match: (write) => write.node === nodes.views.shape.calc
        }) !== undefined
    },
    facts,
    entities: {
      touchedRecordCount: countTouched(touchedRecords),
      touchedFieldCount: countTouched(touchedFields),
      touchedViewCount: countTouched(touchedViews)
    }
  }
}

export const summarizeDelta = (
  commit: EngineCommit
): TraceDeltaSummary => summarizeTypedDelta(commit)

export const toPerformanceKind = (
  commit: Pick<EngineCommit, 'kind' | 'origin'>
): 'dispatch' | 'undo' | 'redo' | 'replace' => {
  if (commit.kind === 'replace') {
    return 'replace'
  }
  return commit.origin === 'history'
    ? 'undo'
    : 'dispatch'
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
  delta: {
    summary: {
      ...trace.delta.summary
    },
    facts: trace.delta.facts.map(item => ({ ...item })),
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
