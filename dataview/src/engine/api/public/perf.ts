export interface EnginePerfOptions {
  trace?: boolean | {
    capacity?: number
  }
  stats?: boolean
}

export type ProjectStageAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export type ProjectStageName =
  | 'query'
  | 'sections'
  | 'calc'

export interface TraceDeltaSummary {
  summary: {
    records: boolean
    fields: boolean
    views: boolean
    values: boolean
    activeView: boolean
    indexes: boolean
  }
  semantics: readonly {
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
    groupMs?: number
    sortMs?: number
    calculationsMs?: number
  }
  records: IndexStageTrace
  search: IndexStageTrace
  group: IndexStageTrace
  sort: IndexStageTrace
  calculations: IndexStageTrace
}

export interface ProjectStageMetrics {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}

export interface ProjectStageTrace {
  stage: ProjectStageName
  action: ProjectStageAction
  executed: boolean
  changed: boolean
  durationMs: number
  metrics?: ProjectStageMetrics
}

export interface ProjectPlanTrace {
  query: ProjectStageAction
  sections: ProjectStageAction
  calc: ProjectStageAction
}

export interface ProjectTrace {
  plan: ProjectPlanTrace
  timings: {
    totalMs: number
  }
  stages: readonly ProjectStageTrace[]
}

export interface PublishTrace {
  storeCount: number
  changedStores: readonly string[]
}

export interface CommitTrace {
  id: number
  kind: 'dispatch' | 'undo' | 'redo' | 'replace'
  timings: {
    totalMs: number
    commitMs?: number
    indexMs?: number
    projectMs?: number
    publishMs?: number
  }
  delta: TraceDeltaSummary
  index: IndexTrace
  project: ProjectTrace
  publish: PublishTrace
}

export interface RunningStat {
  count: number
  total: number
  avg: number
  max: number
  p95?: number
}

export interface PerfCounter {
  total: number
  changed: number
  rebuilt: number
}

export interface StagePerfStats {
  total: number
  reuse: number
  sync: number
  rebuild: number
  changed: number
  duration: RunningStat
}

export interface PerfStats {
  commits: {
    total: number
    dispatch: number
    undo: number
    redo: number
    replace: number
  }
  timings: {
    totalMs: RunningStat
    indexMs: RunningStat
    projectMs: RunningStat
  }
  indexes: Record<'records' | 'search' | 'group' | 'sort' | 'calculations', PerfCounter>
  stages: Record<ProjectStageName, StagePerfStats>
}

export interface EnginePerfApi {
  trace: {
    last: () => CommitTrace | undefined
    list: (limit?: number) => readonly CommitTrace[]
    clear: () => void
  }
  stats: {
    snapshot: () => PerfStats
    clear: () => void
  }
}
