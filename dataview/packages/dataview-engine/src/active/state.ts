import type {
  CalculationCollection,
  FieldReducerState
} from '@dataview/core/view'
import type {
  DataDoc,
  Field,
  FieldId,
  RecordId
} from '@dataview/core/types'
import type { DataviewQueryContext } from '@dataview/core/mutation'
import type {
  DataviewActiveSpec
} from '@dataview/engine/active/frame'
import type {
  DataviewActiveIndex
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
  ItemPlacement,
  SectionBucket,
  Section,
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
  ProjectionFamilySnapshot,
  ProjectionFamilyChange,
  ProjectionValueChange,
  Revision
} from '@shared/projection'
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

export interface DataviewStoreChanges {
  active: ProjectionValueChange<ViewState | undefined>
  fields: ProjectionFamilyChange<FieldId, Field>
  sections: ProjectionFamilyChange<SectionId, Section>
  items: ProjectionFamilyChange<ItemId, ItemPlacement>
  summaries: ProjectionFamilyChange<SectionId, CalculationCollection>
}

export interface DataviewActiveState {
  spec?: DataviewActiveSpec
  index?: DataviewActiveIndex
  query: QueryPhaseState
  membership: MembershipPhaseState
  summary: SummaryPhaseState
  snapshot?: ViewState
  fields: ProjectionFamilySnapshot<FieldId, Field>
  sections: ProjectionFamilySnapshot<SectionId, Section>
  items: ProjectionFamilySnapshot<ItemId, ItemPlacement>
  summaries: ProjectionFamilySnapshot<SectionId, CalculationCollection>
  itemIds: ItemIdPool
  changes: DataviewStoreChanges
  trace: {
    query: DataviewStageTrace
    membership: DataviewStageTrace
    summary: DataviewStageTrace
    publish: DataviewStageTrace
    snapshot: SnapshotTrace
  }
}

export interface DataviewState {
  revision: Revision
  document?: {
    current: DataDoc
    query: DataviewQueryContext
  }
  active: DataviewActiveState
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_SECTION_IDS = [] as readonly SectionId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_FIELDS = new Map<FieldId, Field>()
const EMPTY_SECTIONS = new Map<SectionId, Section>()
const EMPTY_ITEMS = new Map<ItemId, ItemPlacement>()
const EMPTY_SUMMARIES = new Map<SectionId, CalculationCollection>()

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

export const EMPTY_FIELD_FAMILY: ProjectionFamilySnapshot<FieldId, Field> = {
  ids: EMPTY_FIELD_IDS,
  byId: EMPTY_FIELDS
}

export const EMPTY_SECTION_FAMILY: ProjectionFamilySnapshot<SectionId, Section> = {
  ids: EMPTY_SECTION_IDS,
  byId: EMPTY_SECTIONS
}

export const EMPTY_ITEM_FAMILY: ProjectionFamilySnapshot<ItemId, ItemPlacement> = {
  ids: EMPTY_ITEM_IDS,
  byId: EMPTY_ITEMS
}

export const EMPTY_SUMMARY_FAMILY: ProjectionFamilySnapshot<SectionId, CalculationCollection> = {
  ids: EMPTY_SECTION_IDS,
  byId: EMPTY_SUMMARIES
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

export const createEmptyDataviewStoreChanges = (): DataviewStoreChanges => ({
  active: 'skip',
  fields: 'skip',
  sections: 'skip',
  items: 'skip',
  summaries: 'skip'
})

export const createEmptyDataviewActiveState = (): DataviewActiveState => ({
  query: emptyQueryPhaseState(),
  membership: emptyMembershipPhaseState(),
  summary: emptySummaryPhaseState(),
  fields: EMPTY_FIELD_FAMILY,
  sections: EMPTY_SECTION_FAMILY,
  items: EMPTY_ITEM_FAMILY,
  summaries: EMPTY_SUMMARY_FAMILY,
  itemIds: createItemIdPool(),
  changes: createEmptyDataviewStoreChanges(),
  trace: {
    query: EMPTY_STAGE_TRACE,
    membership: EMPTY_STAGE_TRACE,
    summary: EMPTY_STAGE_TRACE,
    publish: EMPTY_STAGE_TRACE,
    snapshot: EMPTY_SNAPSHOT_TRACE
  }
})
