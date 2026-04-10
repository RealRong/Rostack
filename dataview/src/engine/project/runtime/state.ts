import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  AppearanceList,
  FieldList,
  Section,
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
