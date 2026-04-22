import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { BaseImpact } from '@dataview/engine/active/shared/baseImpact'
import type { DocumentReader } from '@dataview/engine/document/reader'
import type {
  ActiveDelta
} from '@dataview/engine/contracts/delta'
import type {
  SnapshotTrace,
  ViewRecords,
  ViewStageMetrics,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts'
import type {
  DeriveAction,
  MembershipDelta,
  MembershipState,
  QueryDelta,
  QueryState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/state'
import type { ItemIdPool } from '@dataview/engine/contracts/shared'

export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface ActiveProjectionInput {
  read: {
    reader: DocumentReader
    fieldsById: ReadonlyMap<FieldId, Field>
  }
  view: {
    plan?: ViewPlan
    previousPlan?: ViewPlan
  }
  index: {
    state: IndexState
    delta?: IndexDelta
  }
  impact: BaseImpact
}

export interface ActiveProjectionRunInput extends ActiveProjectionInput {
  runId: number
}

export interface ActivePhaseMetrics extends ViewStageMetrics {
  deriveMs: number
  publishMs: number
}

export interface ActiveProjectionWorking {
  query: {
    state: QueryState
    records: ViewRecords
    delta: QueryDelta
    runId: number
  }
  membership: {
    state: MembershipState
    previousState: MembershipState
    delta: MembershipDelta
    action: DeriveAction
    runId: number
  }
  summary: {
    state: SummaryState
    previousState: SummaryState
    delta: SummaryDelta
    runId: number
  }
  publish: {
    itemIds: ItemIdPool
    snapshot?: ViewState
    delta?: ActiveDelta
  }
}

export interface ActiveProjectionTrace {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
}

export interface ActiveProjectionResult {
  snapshot?: ViewState
  delta?: ActiveDelta
  trace: ActiveProjectionTrace
}

export interface ActiveProjectionRuntime {
  update(input: ActiveProjectionInput): ActiveProjectionResult
}
