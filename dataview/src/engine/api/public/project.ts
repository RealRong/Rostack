import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
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
import type { KeyedReadStore, ReadStore } from '@shared/core'

export interface EngineReadApi {
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
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

export interface EngineProjectApi {
  view: ReadStore<ActiveView | undefined>
  filter: ReadStore<ViewFilterProjection | undefined>
  group: ReadStore<ViewGroupProjection | undefined>
  search: ReadStore<ViewSearchProjection | undefined>
  sort: ReadStore<ViewSortProjection | undefined>
  records: ReadStore<RecordSet | undefined>
  sections: ReadStore<readonly Section[] | undefined>
  appearances: ReadStore<AppearanceList | undefined>
  fields: ReadStore<FieldList | undefined>
  calculations: ReadStore<ReadonlyMap<SectionKey, CalculationCollection> | undefined>
}
