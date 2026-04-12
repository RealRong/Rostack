import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  BucketSort,
  CalculationMetric,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  Field,
  FieldId,
  Filter,
  FilterRule,
  GalleryCardSize,
  KanbanCardsPerColumn,
  RecordId,
  DataRecord,
  SortDirection,
  Sorter,
  View,
  ViewId,
  ViewGroup,
  ViewType
} from '@dataview/core/contracts'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  FieldList,
  Section,
  SectionList,
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
import type { CellRef, Placement } from '../../project/refs'
import type {
  ViewGalleryApi,
  ViewKanbanApi,
  ViewCellsApi,
  ViewItemsApi,
  ViewOrderApi
} from './services'

export interface EngineReadApi {
  document: ReadStore<DataDoc>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, DataRecord | undefined>
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
  derived: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}

export interface ActiveQuery {
  filter: ViewFilterProjection
  group: ViewGroupProjection
  search: ViewSearchProjection
  sort: ViewSortProjection
}

export interface ActiveViewState {
  view: View
  query: ActiveQuery
  records: RecordSet
  sections: SectionList
  appearances: AppearanceList
  fields: FieldList
  calculations: ReadonlyMap<SectionKey, CalculationCollection>
}

export interface ActiveCell {
  appearanceId: AppearanceId
  recordId: RecordId
  fieldId: FieldId
  sectionKey: SectionKey
  record: DataRecord
  field: Field | undefined
  value: unknown
}

export interface ItemMovePlan {
  appearanceIds: readonly AppearanceId[]
  recordIds: readonly RecordId[]
  changed: boolean
  sectionChanged: boolean
  target: {
    sectionKey: SectionKey
    beforeAppearanceId?: AppearanceId
    beforeRecordId?: RecordId
  }
}

export interface ActiveReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined
  section: (key: SectionKey) => Section | undefined
  appearance: (id: AppearanceId) => Appearance | undefined
  cell: (ref: CellRef) => ActiveCell | undefined
  filterField: (index: number) => Field | undefined
  groupField: () => Field | undefined
  planMove: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => ItemMovePlan
}

export interface ActiveGalleryState {
  groupUsesOptionColors: boolean
  canReorder: boolean
  cardSize: GalleryCardSize
}

export interface ActiveKanbanState {
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
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

export interface ActiveEngineApi {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveReadApi
  type: {
    set: (type: ViewType) => void
  }
  search: {
    set: (value: string) => void
  }
  filter: {
    add: (fieldId: FieldId) => void
    set: (index: number, rule: FilterRule) => void
    preset: (index: number, presetId: string) => void
    value: (index: number, value: FilterRule['value'] | undefined) => void
    mode: (value: Filter['mode']) => void
    remove: (index: number) => void
    clear: () => void
  }
  sort: {
    add: (fieldId: FieldId, direction?: SortDirection) => void
    set: (fieldId: FieldId, direction: SortDirection) => void
    only: (fieldId: FieldId, direction: SortDirection) => void
    move: (from: number, to: number) => void
    replace: (index: number, sorter: Sorter) => void
    remove: (index: number) => void
    clear: () => void
  }
  group: {
    set: (fieldId: FieldId) => void
    clear: () => void
    toggle: (fieldId: FieldId) => void
    setMode: (mode: string) => void
    setSort: (sort: BucketSort) => void
    setInterval: (interval: ViewGroup['bucketInterval']) => void
    setShowEmpty: (value: boolean) => void
    show: (key: string) => void
    hide: (key: string) => void
    collapse: (key: string) => void
    expand: (key: string) => void
    toggleCollapse: (key: string) => void
  }
  calc: {
    set: (fieldId: FieldId, metric: CalculationMetric | null) => void
  }
  display: {
    replace: (fieldIds: readonly FieldId[]) => void
    move: (
      fieldIds: readonly FieldId[],
      beforeFieldId?: FieldId | null
    ) => void
    show: (
      fieldId: FieldId,
      beforeFieldId?: FieldId | null
    ) => void
    hide: (fieldId: FieldId) => void
    clear: () => void
  }
  table: {
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
  gallery: ActiveGalleryApi
  kanban: ActiveKanbanApi
  order: ViewOrderApi
  items: ViewItemsApi
  cells: ViewCellsApi
}
