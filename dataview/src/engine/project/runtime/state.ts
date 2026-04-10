import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionBucket,
  SectionKey
} from '../types'
import type {
  ActiveView,
  FilterView,
  GroupView,
  RecordSet,
  SearchView,
  SortView
} from '../../types'

export interface ProjectState {
  view?: ActiveView
  filter?: FilterView
  group?: GroupView
  search?: SearchView
  sort?: SortView
  records?: RecordSet
  sections?: readonly Section[]
  appearances?: AppearanceList
  fields?: FieldList
  calculations?: ReadonlyMap<SectionKey, CalculationCollection>
}

export type ProjectionAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export interface QueryState {
  derived: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  visibleSet: ReadonlySet<RecordId>
  order: ReadonlyMap<RecordId, number>
}

export interface SectionNodeState {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  ids: readonly RecordId[]
  visible: boolean
  collapsed: boolean
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
  byRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface CalcState {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, import('../../index/types').AggregateState>>
}

export interface ProjectionState {
  query: QueryState
  sections: SectionState
  calc: CalcState
}

const EMPTY_CALC_BY_SECTION = new Map<SectionKey, ReadonlyMap<FieldId, import('../../index/types').AggregateState>>()
const EMPTY_CALC_STATE: CalcState = {
  bySection: EMPTY_CALC_BY_SECTION
}

export const emptyQueryState = (): QueryState => ({
  derived: [],
  ordered: [],
  visible: [],
  visibleSet: new Set(),
  order: new Map()
})

export const emptySectionState = (): SectionState => ({
  order: [],
  byKey: new Map(),
  byRecord: new Map()
})

export const emptyCalcState = (): CalcState => EMPTY_CALC_STATE

export const emptyProjectionState = (): ProjectionState => ({
  query: emptyQueryState(),
  sections: emptySectionState(),
  calc: emptyCalcState()
})

export const emptyProjectState = (): ProjectState => ({
  view: undefined,
  filter: undefined,
  group: undefined,
  search: undefined,
  sort: undefined,
  records: undefined,
  sections: undefined,
  appearances: undefined,
  fields: undefined,
  calculations: undefined
})
