import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { BaseImpact } from '@dataview/engine/active/projector/impact'
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

type ScopeFlagField = {
  kind: 'flag'
}

type ScopeSlotField<TValue> = {
  kind: 'slot'
  __value?: TValue
}

type ScopeField =
  | ScopeFlagField
  | ScopeSlotField<unknown>

type ScopeSchema<TFields extends Record<string, ScopeField>> = {
  kind: 'scope'
  fields: TFields
}

type ScopeFieldInputValue<TField extends ScopeField> =
  TField extends ScopeFlagField
    ? boolean
    : TField extends ScopeSlotField<infer TValue>
      ? TValue
      : never

type ScopeFieldValue<TField extends ScopeField> =
  TField extends ScopeFlagField
    ? boolean
    : TField extends ScopeSlotField<infer TValue>
      ? TValue | undefined
      : never

export type ScopeInputValue<TSchema> = TSchema extends ScopeSchema<infer TFields>
  ? Partial<{
      [K in keyof TFields]: ScopeFieldInputValue<TFields[K]>
    }>
  : undefined

export type ScopeValue<TSchema> = TSchema extends ScopeSchema<infer TFields>
  ? {
      [K in keyof TFields]: ScopeFieldValue<TFields[K]>
    }
  : undefined

const FLAG_SCOPE_FIELD = {
  kind: 'flag'
} as const satisfies ScopeFlagField

const SLOT_SCOPE_FIELD = {
  kind: 'slot'
} as const satisfies ScopeSlotField<never>

const scopeFlag = (): ScopeFlagField => FLAG_SCOPE_FIELD

const scopeSlot = <TValue,>(): ScopeSlotField<TValue> => (
  SLOT_SCOPE_FIELD as ScopeSlotField<TValue>
)

const createScope = <TFields extends Record<string, ScopeField>>(
  fields: TFields
): ScopeSchema<TFields> => ({
  kind: 'scope',
  fields
})

export type ActivePhaseName =
  | 'query'
  | 'membership'
  | 'summary'
  | 'publish'

export interface ActiveProjectorInput {
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

export const membershipPhaseScope = createScope({
  query: scopeSlot<MembershipPhaseScope['query']>()
})

export const summaryPhaseScope = createScope({
  membership: scopeSlot<SummaryPhaseScope['membership']>()
})

export const publishPhaseScope = createScope({
  reset: scopeFlag(),
  membership: scopeSlot<PublishPhaseScope['membership']>(),
  summary: scopeSlot<PublishPhaseScope['summary']>()
})

export interface ActivePhaseScopeMap {
  query: undefined
  membership: typeof membershipPhaseScope
  summary: typeof summaryPhaseScope
  publish: typeof publishPhaseScope
}

export interface ActiveProjectorWorking {
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

export type ActiveProjectionTrace = ProjectionTrace<
  ActivePhaseName,
  ActivePhaseMetrics
>
