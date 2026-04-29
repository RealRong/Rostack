import { metrics } from '@shared/core'
import type {
  CommitRecord,
  MutationChange,
  MutationDelta
} from '@shared/mutation'
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
import {
  readTouchedFields,
  readTouchedRecords,
  readTouchedViews
} from '@dataview/engine/active/projection/dirty'

const readIds = (
  change: MutationChange | undefined
): readonly string[] | 'all' | undefined => {
  if (change?.ids !== undefined) {
    return change.ids
  }

  if (change?.paths === 'all') {
    return 'all'
  }

  return change?.paths
    ? Object.keys(change.paths)
    : undefined
}

const readPaths = (
  change: MutationChange | undefined
): Readonly<Record<string, readonly string[] | 'all'>> | 'all' | undefined => (
  change?.paths
)

const hasChange = (
  delta: MutationDelta,
  key: string
): boolean => delta.changes.has(key)

type PendingCommitTrace = Omit<CommitTrace, 'id'>

const countIds = (
  ids: readonly string[] | 'all' | undefined
): number | 'all' | undefined => ids === 'all'
  ? 'all'
  : ids?.length

const countPaths = (
  paths: Record<string, readonly string[] | 'all'> | 'all' | undefined
): number | 'all' | undefined => paths === 'all'
  ? 'all'
  : paths
    ? Object.keys(paths).length
    : undefined

const toTouchedCount = <T,>(
  value: ReadonlySet<T> | 'all'
): number | 'all' => value === 'all'
  ? 'all'
  : value.size

export const summarizeDelta = (
  delta: MutationDelta
): TraceDeltaSummary => {
  const recordCreate = delta.changes.get('record.create')
  const recordTitle = delta.changes.get('record.title')
  const recordType = delta.changes.get('record.type')
  const recordMeta = delta.changes.get('record.meta')
  const recordDelete = delta.changes.get('record.delete')
  const recordValues = delta.changes.get('record.values')
  const fieldCreate = delta.changes.get('field.create')
  const fieldDelete = delta.changes.get('field.delete')
  const fieldSchema = delta.changes.get('field.schema')
  const fieldMeta = delta.changes.get('field.meta')
  const viewCreate = delta.changes.get('view.create')
  const viewQuery = delta.changes.get('view.query')
  const viewLayout = delta.changes.get('view.layout')
  const viewCalc = delta.changes.get('view.calc')
  const viewDelete = delta.changes.get('view.delete')
  const activeView = delta.changes.get('document.activeViewId')
  const externalVersion = delta.changes.get('external.version')

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

  pushFact('record.insert', countIds(readIds(recordCreate)))
  pushFact('record.title', countIds(readIds(recordTitle)))
  pushFact('record.type', countIds(readIds(recordType)))
  pushFact('record.meta', countIds(readIds(recordMeta)))
  pushFact('record.remove', countIds(readIds(recordDelete)))
  pushFact('record.value', countPaths(readPaths(recordValues)))
  pushFact('field.insert', countIds(readIds(fieldCreate)))
  pushFact('field.remove', countIds(readIds(fieldDelete)))
  pushFact('field.schema', countIds(readIds(fieldSchema)))
  pushFact('field.meta', countIds(readIds(fieldMeta)))
  pushFact('view.insert', countIds(readIds(viewCreate)))
  pushFact('view.change', countIds(readIds(viewQuery)))
  pushFact('view.layout', countIds(readIds(viewLayout)))
  pushFact('view.calc', countIds(readIds(viewCalc)))
  pushFact('view.remove', countIds(readIds(viewDelete)))
  pushFact('activeView.set', activeView ? 1 : undefined)
  pushFact('external.version', externalVersion ? 1 : undefined)
  pushFact('reset', delta.reset === true ? 1 : undefined)

  return {
    summary: {
      records: delta.reset === true
        || hasChange(delta, 'record.create')
        || hasChange(delta, 'record.title')
        || hasChange(delta, 'record.type')
        || hasChange(delta, 'record.meta')
        || hasChange(delta, 'record.delete')
        || hasChange(delta, 'record.values'),
      fields: delta.reset === true
        || hasChange(delta, 'field.create')
        || hasChange(delta, 'field.delete')
        || hasChange(delta, 'field.schema')
        || hasChange(delta, 'field.meta'),
      views: delta.reset === true
        || hasChange(delta, 'view.create')
        || hasChange(delta, 'view.query')
        || hasChange(delta, 'view.layout')
        || hasChange(delta, 'view.calc')
        || hasChange(delta, 'view.delete'),
      activeView: delta.reset === true
        || hasChange(delta, 'document.activeViewId'),
      external: hasChange(delta, 'external.version'),
      indexes: delta.reset === true
        || hasChange(delta, 'record.create')
        || hasChange(delta, 'record.title')
        || hasChange(delta, 'record.type')
        || hasChange(delta, 'record.meta')
        || hasChange(delta, 'record.delete')
        || hasChange(delta, 'record.values')
        || hasChange(delta, 'field.create')
        || hasChange(delta, 'field.delete')
        || hasChange(delta, 'field.schema')
        || hasChange(delta, 'field.meta')
        || hasChange(delta, 'view.query')
        || hasChange(delta, 'view.calc')
    },
    facts,
    entities: {
      touchedRecordCount: toTouchedCount(readTouchedRecords(delta)),
      touchedFieldCount: toTouchedCount(readTouchedFields(delta)),
      touchedViewCount: toTouchedCount(readTouchedViews(delta))
    }
  }
}

export const toPerformanceKind = (
  commit: Pick<CommitRecord<any, any, any, any>, 'kind' | 'origin'>
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
