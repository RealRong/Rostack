import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  Field,
  FieldId,
  GalleryCardSize,
  KanbanCardsPerColumn,
  RecordId,
  Row,
  View,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type {
  AppearanceId,
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
  ViewEngineApi,
  ViewGalleryApi,
  ViewKanbanApi
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
  filter: ViewFilterProjection
  group: ViewGroupProjection
  search: ViewSearchProjection
  sort: ViewSortProjection
  records: RecordSet
  sections: readonly Section[]
  appearances: AppearanceList
  fields: FieldList
  calculations: ReadonlyMap<SectionKey, CalculationCollection>
}

export interface ActiveViewReadApi {
  getRecord: (recordId: RecordId) => Row | undefined
  getField: (fieldId: FieldId) => Field | undefined
  getGroupField: () => Field | undefined
  getFilterField: (index: number) => Field | undefined
  getRecordField: (cell: CellRef) => RecordFieldRef | undefined
  getSectionRecordIds: (section: SectionKey) => readonly RecordId[]
  getAppearanceRecordId: (appearanceId: AppearanceId) => RecordId | undefined
  getAppearanceRecord: (appearanceId: AppearanceId) => Row | undefined
  getAppearanceSectionKey: (appearanceId: AppearanceId) => SectionKey | undefined
  getSectionColor: (section: SectionKey) => string | undefined
  getDisplayFieldIndex: (fieldId: FieldId) => number
}

export interface ActiveTableState {
  groupField: Field | undefined
  customFields: readonly CustomField[]
  visibleFieldIds: readonly FieldId[]
  showVerticalLines: boolean
}

export interface ActiveGalleryState {
  sections: readonly Section[]
  groupField: Field | undefined
  groupUsesOptionColors: boolean
  customFields: readonly CustomField[]
  canReorder: boolean
  cardSize: GalleryCardSize
}

export interface ActiveKanbanState {
  groupField: Field | undefined
  groupUsesOptionColors: boolean
  customFields: readonly CustomField[]
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
}

export interface ActiveTableApi {
  state: ReadStore<ActiveTableState | undefined>
  setWidths: (widths: Partial<Record<FieldId, number>>) => void
  setVerticalLines: (value: boolean) => void
  insertLeft: (
    anchorFieldId: FieldId,
    input?: {
      name?: string
      kind?: CustomFieldKind
    }
  ) => CustomFieldId | undefined
  insertRight: (
    anchorFieldId: FieldId,
    input?: {
      name?: string
      kind?: CustomFieldKind
    }
  ) => CustomFieldId | undefined
}

export interface ActiveGalleryApi extends ViewGalleryApi {
  state: ReadStore<ActiveGalleryState | undefined>
}

export interface ActiveKanbanApi extends ViewKanbanApi {
  state: ReadStore<ActiveKanbanState | undefined>
}

export interface ActiveSelectApi {
  <T>(
    selector: (state: ActiveViewState | undefined) => T,
    isEqual?: Equality<T>
  ): ReadStore<T>
}

export interface ActiveEngineApi extends Omit<ViewEngineApi, 'table' | 'gallery' | 'kanban'> {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveViewReadApi
  table: ActiveTableApi
  gallery: ActiveGalleryApi
  kanban: ActiveKanbanApi
}
