import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { ItemIdPool } from '@dataview/engine/active/publish/itemIdPool'
import type { MutationDelta } from '@shared/mutation'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  QueryPhaseDelta,
  QueryPhaseState,
  SummaryPhaseDelta,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import type {
  SnapshotTrace,
  ViewStageMetrics,
  ViewTrace
} from '@dataview/engine/contracts/performance'
import type { ViewState } from '@dataview/engine/contracts/view'
import type { DocumentReader } from '@dataview/engine/document/reader'

export type ScopeValue<T> = T | undefined
export type ScopeInputValue<T> = T | undefined
export type ScopeSchema<T> = {
  [TKey in keyof T]-?: T[TKey] extends boolean
    ? 'flag'
    : 'value'
}

export interface ProjectionTracePhase<
  TName extends string,
  TMetrics = unknown
> {
  name: TName
  action: 'reuse' | 'sync'
  changed: boolean
  durationMs: number
  metrics?: TMetrics
}

export interface ProjectionTrace<
  TName extends string,
  TMetrics = unknown
> {
  revision: number
  phases: readonly ProjectionTracePhase<TName, TMetrics>[]
  totalMs: number
}

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
  delta: MutationDelta
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

export const membershipPhaseScope: ScopeSchema<MembershipPhaseScope> = {
  query: 'value'
}

export const summaryPhaseScope: ScopeSchema<SummaryPhaseScope> = {
  membership: 'value'
}

export const publishPhaseScope: ScopeSchema<PublishPhaseScope> = {
  reset: 'flag',
  membership: 'value',
  summary: 'value'
}

export interface ActivePhaseScopeMap {
  query: undefined
  membership: MembershipPhaseScope
  summary: SummaryPhaseScope
  publish: PublishPhaseScope
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
  }
}

export interface ActiveProjectionCapture {
  snapshot?: ViewState
}

export interface ActiveViewProjectionTrace {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
}

export interface ActiveProjectionResult {
  snapshot?: ViewState
  trace: ActiveViewProjectionTrace
}

export interface ActiveProjectionRuntime {
  update(input: ActiveProjectionInput): ActiveProjectionResult
}

export type ActiveProjectionTrace = ProjectionTrace<
  ActivePhaseName,
  ActivePhaseMetrics
>
