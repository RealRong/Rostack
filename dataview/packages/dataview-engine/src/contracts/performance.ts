import type { RunningStat as SharedRunningStat } from '@shared/core'

export interface PerformanceOptions {
  traces?: boolean | {
    capacity?: number
  }
  stats?: boolean
}

export type ViewStageAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export type ViewStageName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface TraceDeltaSummary {
  summary: {
    records: boolean
    fields: boolean
    views: boolean
    activeView: boolean
    external: boolean
    indexes: boolean
  }
  facts: readonly {
    kind: string
    count?: number
  }[]
  entities: {
    touchedRecordCount?: number | 'all'
    touchedFieldCount?: number | 'all'
    touchedViewCount?: number | 'all'
  }
}

export interface IndexStageTrace {
  action: 'reuse' | 'sync' | 'rebuild'
  changed: boolean
  inputSize?: number
  outputSize?: number
  touchedFieldCount?: number | 'all'
  touchedRecordCount?: number | 'all'
  durationMs: number
}

export interface IndexTrace {
  changed: boolean
  timings: {
    totalMs: number
    recordsMs?: number
    searchMs?: number
    bucketMs?: number
    sortMs?: number
    summariesMs?: number
  }
  records: IndexStageTrace
  search: IndexStageTrace
  bucket: IndexStageTrace
  sort: IndexStageTrace
  summaries: IndexStageTrace
}

export interface ViewStageMetrics {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}

export interface ViewStageTrace {
  stage: ViewStageName
  action: ViewStageAction
  executed: boolean
  changed: boolean
  durationMs: number
  deriveMs: number
  publishMs: number
  metrics?: ViewStageMetrics
}

export interface ViewPlanTrace {
  query: ViewStageAction
  membership: ViewStageAction
  summary: ViewStageAction
  publish: ViewStageAction
}

export interface ViewTrace {
  plan: ViewPlanTrace
  timings: {
    totalMs: number
  }
  stages: readonly ViewStageTrace[]
}

export interface SnapshotTrace {
  storeCount: number
  changedStores: readonly string[]
}

export interface CommitTrace {
  id: number
  kind: 'dispatch' | 'undo' | 'redo' | 'replace'
  timings: {
    totalMs: number
    planMs?: number
    commitMs?: number
    indexMs?: number
    viewMs?: number
    outputMs?: number
    snapshotMs?: number
  }
  delta: TraceDeltaSummary
  index: IndexTrace
  view: ViewTrace
  snapshot: SnapshotTrace
}

export type RunningStat = SharedRunningStat

export interface PerformanceCounter {
  total: number
  changed: number
  rebuilt: number
}

export interface StagePerformanceStats {
  total: number
  reuse: number
  sync: number
  rebuild: number
  changed: number
  duration: RunningStat
}

export interface PerformanceStats {
  commits: {
    total: number
    dispatch: number
    undo: number
    redo: number
    replace: number
  }
  timings: {
    totalMs: RunningStat
    planMs: RunningStat
    indexMs: RunningStat
    viewMs: RunningStat
    outputMs: RunningStat
  }
  indexes: Record<'records' | 'search' | 'bucket' | 'sort' | 'summaries', PerformanceCounter>
  stages: Record<ViewStageName, StagePerformanceStats>
}

export interface PerformanceApi {
  traces: {
    last: () => CommitTrace | undefined
    list: (limit?: number) => readonly CommitTrace[]
    clear: () => void
  }
  stats: {
    snapshot: () => PerformanceStats
    clear: () => void
  }
}
