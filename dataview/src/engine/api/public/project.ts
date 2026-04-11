import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  Field,
  FieldId,
  RecordId,
  Row,
  View,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionKey
} from '../../project/readModels'
import type {
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '../../project/viewProjections'
import type {
  KeyedReadStore,
  ReadStore,
  Equality
} from '@shared/core'
import type {
  CellRef,
  RecordFieldRef
} from '../../project/refs'
import type {
  ViewEngineApi
} from './services'

export interface EngineReadApi {
  document: ReadStore<DataDoc>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, Row | undefined>
  customFieldIds: ReadStore<readonly CustomFieldId[]>
  customFields: ReadStore<readonly CustomField[]>
  customField: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  views: ReadStore<readonly View[]>
  view: KeyedReadStore<ViewId, View | undefined>
}

export interface ActiveView {
  id: ViewId
  name: string
  type: ViewType
}

export interface RecordSet {
  viewId: ViewId
  derivedIds: readonly RecordId[]
  orderedIds: readonly RecordId[]
  visibleIds: readonly RecordId[]
}

export interface ActiveViewState {
  view: View
  filter: ViewFilterProjection | undefined
  group: ViewGroupProjection | undefined
  search: ViewSearchProjection | undefined
  sort: ViewSortProjection | undefined
  records: RecordSet | undefined
  sections: readonly Section[] | undefined
  appearances: AppearanceList | undefined
  fields: FieldList | undefined
  calculations: ReadonlyMap<SectionKey, CalculationCollection> | undefined
}

export interface ActiveViewReadApi {
  getRecord: (recordId: RecordId) => Row | undefined
  getField: (fieldId: FieldId) => Field | undefined
  getGroupField: () => Field | undefined
  getFilterField: (index: number) => Field | undefined
  getRecordField: (cell: CellRef) => RecordFieldRef | undefined
  getSectionRecordIds: (section: SectionKey) => readonly RecordId[]
}

export interface ActiveSelectApi {
  <T>(
    selector: (state: ActiveViewState | undefined) => T,
    isEqual?: Equality<T>
  ): ReadStore<T>
}

export interface ActiveEngineApi extends ViewEngineApi {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveViewReadApi
}
