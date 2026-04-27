import type {
  FieldReducerState
} from '@dataview/core/view'
import type {
  FieldId,
  RecordId
} from '@dataview/core/types'
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
  SectionBucket,
  SectionId
} from '@dataview/engine/contracts/shared'
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

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionId[]

export const EMPTY_QUERY_PHASE_DELTA: QueryPhaseDelta = {
  rebuild: false,
  added: EMPTY_RECORD_IDS,
  removed: EMPTY_RECORD_IDS,
  orderChanged: false
}

export const EMPTY_MEMBERSHIP_PHASE_DELTA: MembershipPhaseDelta = {
  rebuild: false,
  orderChanged: false,
  removed: EMPTY_SECTION_KEYS,
  changed: EMPTY_SECTION_KEYS,
  records: new Map()
}

export const EMPTY_SUMMARY_PHASE_DELTA: SummaryPhaseDelta = {
  rebuild: false,
  changed: EMPTY_SECTION_KEYS,
  removed: EMPTY_SECTION_KEYS
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
