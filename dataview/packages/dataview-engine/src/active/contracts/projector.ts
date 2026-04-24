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
import type { ItemIdPool } from '@dataview/engine/active/shared/itemIdPool'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  QueryPhaseDelta,
  QueryPhaseState,
  SummaryPhaseDelta,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type {
  SnapshotTrace,
  ViewStageMetrics,
  ViewTrace
} from '@dataview/engine/contracts/performance'
import type { ViewRecords } from '@dataview/engine/contracts/shared'
import type { ViewState } from '@dataview/engine/contracts/view'
import type { DocumentReader } from '@dataview/engine/document/reader'

export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface ActiveProjectorInput {
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

export interface ActiveProjectorRunInput extends ActiveProjectorInput {
  runId: number
}

export interface ActivePhaseMetrics extends ViewStageMetrics {
  deriveMs: number
  publishMs: number
}

export interface MembershipPhaseScope {
  query?: {
    action: PhaseAction
    delta: QueryPhaseDelta
  }
}

export interface SummaryPhaseScope {
  membership?: {
    action: PhaseAction
    previous?: MembershipPhaseState
    delta: MembershipPhaseDelta
  }
}

export interface PublishPhaseScope {
  reset: boolean
  membership?: {
    previous?: MembershipPhaseState
  }
  summary?: {
    previous?: SummaryPhaseState
    delta: SummaryPhaseDelta
  }
}

export interface ActivePhaseScopeMap {
  query: undefined
  membership: MembershipPhaseScope
  summary: SummaryPhaseScope
  publish: PublishPhaseScope
}

export interface ActiveProjectorWorking {
  query: {
    state: QueryPhaseState
    records: ViewRecords
  }
  membership: {
    state: MembershipPhaseState
  }
  summary: {
    state: SummaryPhaseState
  }
  publish: {
    itemIds: ItemIdPool
    snapshot?: ViewState
    delta?: ActiveDelta
  }
}

export interface ActiveProjectorTrace {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
}

export interface ActiveProjectorResult {
  snapshot?: ViewState
  delta?: ActiveDelta
  trace: ActiveProjectorTrace
}

export interface ActiveProjector {
  update(input: ActiveProjectorInput): ActiveProjectorResult
}
