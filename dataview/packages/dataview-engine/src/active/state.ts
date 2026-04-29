import type {
  FieldReducerState
} from '@dataview/core/view'
import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  DataviewActiveFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewIndexBank
} from '@dataview/engine/active/index/runtime'
import type {
  Partition
} from '@dataview/engine/active/shared/partition'
import {
  EMPTY_PARTITION
} from '@dataview/engine/active/shared/partition'
import type {
  Selection
} from '@dataview/engine/active/shared/selection'
import {
  EMPTY_SELECTION
} from '@dataview/engine/active/shared/selection'
import {
  EMPTY_SUMMARY_STATE
} from '@dataview/engine/active/summary/empty'
import type {
  SnapshotTrace,
  ViewStageAction,
  ViewStageMetrics
} from '@dataview/engine/contracts/performance'
import type {
  ItemId,
  SectionBucket,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import {
  createItemIdPool,
  type ItemIdPool
} from '@dataview/engine/active/publish/itemIdPool'
import type {
  EntityDelta
} from '@shared/delta'
import type {
  Token
} from '@shared/i18n'

export type PhaseAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export interface QueryPhaseState {
  matched: Selection
  ordered: Selection
  visible: Selection
  search?: {
    query: string
    sourceKey: string
    sourceRevisionKey: string
    matched: readonly RecordId[]
  }
}

export interface QueryPhaseDelta {
  rebuild: boolean
  added: readonly RecordId[]
  removed: readonly RecordId[]
  orderChanged: boolean
}

export interface MembershipMetaState {
  label: Token
  color?: string
  bucket?: SectionBucket
}

export interface MembershipPhaseState {
  sections: Partition<SectionId>
  meta: ReadonlyMap<SectionId, MembershipMetaState>
}

export interface MembershipRecordChange {
  before: readonly SectionId[]
  after: readonly SectionId[]
}

export interface MembershipPhaseDelta {
  rebuild: boolean
  orderChanged: boolean
  removed: readonly SectionId[]
  changed: readonly SectionId[]
  records: ReadonlyMap<RecordId, MembershipRecordChange>
}

export interface SummaryPhaseState {
  bySection: ReadonlyMap<SectionId, ReadonlyMap<FieldId, FieldReducerState>>
}

export interface SummaryPhaseDelta {
  rebuild: boolean
  changed: readonly SectionId[]
  removed: readonly SectionId[]
}

export interface DataviewStageTrace {
  action: ViewStageAction
  changed: boolean
  deriveMs: number
  publishMs: number
  metrics?: ViewStageMetrics
}

export interface DataviewPatches {
  fields?: EntityDelta<FieldId>
  sections?: EntityDelta<SectionId>
  items?: EntityDelta<ItemId>
  summaries?: EntityDelta<SectionId>
}

export interface DataviewLastActive {
  id: ViewId
  queryKey: string
  section?: DataviewActiveFrame['section']
  calcFields: readonly FieldId[]
}

export interface DataviewActiveState {
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  snapshot?: ViewState
  itemIds: ItemIdPool
  patches: DataviewPatches
  trace: {
    query: DataviewStageTrace
    membership: DataviewStageTrace
    summary: DataviewStageTrace
    publish: DataviewStageTrace
    snapshot: SnapshotTrace
  }
}

export interface DataviewState {
  frame?: DataviewFrame
  lastActive?: DataviewLastActive
  index: DataviewIndexBank
  active: DataviewActiveState
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_SECTION_IDS = [] as readonly SectionId[]

export const EMPTY_QUERY_PHASE_DELTA: QueryPhaseDelta = {
  rebuild: false,
  added: EMPTY_RECORD_IDS,
  removed: EMPTY_RECORD_IDS,
  orderChanged: false
}

export const EMPTY_MEMBERSHIP_PHASE_DELTA: MembershipPhaseDelta = {
  rebuild: false,
  orderChanged: false,
  removed: EMPTY_SECTION_IDS,
  changed: EMPTY_SECTION_IDS,
  records: new Map()
}

export const EMPTY_SUMMARY_PHASE_DELTA: SummaryPhaseDelta = {
  rebuild: false,
  changed: EMPTY_SECTION_IDS,
  removed: EMPTY_SECTION_IDS
}

export const EMPTY_SNAPSHOT_TRACE: SnapshotTrace = {
  storeCount: 0,
  changedStores: []
}

export const EMPTY_STAGE_TRACE: DataviewStageTrace = {
  action: 'reuse',
  changed: false,
  deriveMs: 0,
  publishMs: 0
}

export const emptyQueryPhaseState = (): QueryPhaseState => ({
  matched: EMPTY_SELECTION,
  ordered: EMPTY_SELECTION,
  visible: EMPTY_SELECTION
})

export const emptyMembershipPhaseState = (): MembershipPhaseState => ({
  sections: EMPTY_PARTITION,
  meta: new Map()
})

export const emptySummaryPhaseState = (): SummaryPhaseState => EMPTY_SUMMARY_STATE

export const createEmptyDataviewActiveState = (): DataviewActiveState => ({
  query: emptyQueryPhaseState(),
  membership: emptyMembershipPhaseState(),
  summary: emptySummaryPhaseState(),
  itemIds: createItemIdPool(),
  patches: {},
  trace: {
    query: EMPTY_STAGE_TRACE,
    membership: EMPTY_STAGE_TRACE,
    summary: EMPTY_STAGE_TRACE,
    publish: EMPTY_STAGE_TRACE,
    snapshot: EMPTY_SNAPSHOT_TRACE
  }
})

export const isQueryPhaseStateEmpty = (
  state: QueryPhaseState
): boolean => state.visible.read.count() === 0
  && state.matched.read.count() === 0
  && state.ordered.read.count() === 0
  && state.search === undefined

export const isMembershipPhaseStateEmpty = (
  state: MembershipPhaseState
): boolean => state.sections.order.length === 0
  && state.meta.size === 0

export const isSummaryPhaseStateEmpty = (
  state: SummaryPhaseState
): boolean => state.bySection.size === 0
