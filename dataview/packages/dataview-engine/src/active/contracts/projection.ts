import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { BaseImpact } from '@dataview/engine/active/projection/impact'
import type { ItemIdPool } from '@dataview/engine/active/publish/itemIdPool'
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
import type { ViewState } from '@dataview/engine/contracts/view'
import type { DocumentReader } from '@dataview/engine/document/reader'
import type { ProjectionTrace } from '@shared/projection'
import {
  createFlagScopeField,
  createScopeSchema,
  createSlotScopeField,
  type InternalScopeInputValue as ScopeInputValue,
  type InternalScopeValue as ScopeValue
} from '@shared/projection/internal'

export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface ActiveProjectionInput {
  read: {
    reader: DocumentReader
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

export const membershipPhaseScope = createScopeSchema({
  query: createSlotScopeField<MembershipPhaseScope['query']>()
})

export const summaryPhaseScope = createScopeSchema({
  membership: createSlotScopeField<SummaryPhaseScope['membership']>()
})

export const publishPhaseScope = createScopeSchema({
  reset: createFlagScopeField(),
  membership: createSlotScopeField<PublishPhaseScope['membership']>(),
  summary: createSlotScopeField<PublishPhaseScope['summary']>()
})

export interface ActivePhaseScopeMap {
  query: undefined
  membership: typeof membershipPhaseScope
  summary: typeof summaryPhaseScope
  publish: typeof publishPhaseScope
}

export interface ActiveProjectionWorking {
  query: {
    state: QueryPhaseState
  }
  membership: {
    state: MembershipPhaseState
  }
  summary: {
    state: SummaryPhaseState
  }
  publish: {
    itemIds: ItemIdPool
    previous?: ViewState
    snapshot?: ViewState
    delta?: ActiveDelta
  }
}

export interface ActiveProjectionCapture {
  snapshot?: ViewState
  delta?: ActiveDelta
}

export interface ActiveViewProjectionTrace {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
}

export interface ActiveProjectionResult {
  snapshot?: ViewState
  delta?: ActiveDelta
  trace: ActiveViewProjectionTrace
}

export interface ActiveProjectionRuntime {
  update(input: ActiveProjectionInput): ActiveProjectionResult
}

export type ActiveProjectionTrace = ProjectionTrace<
  ActivePhaseName,
  ActivePhaseMetrics
>

export type {
  ScopeInputValue,
  ScopeValue
}
