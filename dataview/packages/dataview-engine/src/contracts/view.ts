import type {
  BucketSort,
  CardLayout,
  CardSize,
  CalculationMetric,
  CustomFieldId,
  CustomFieldKind,
  DataRecord,
  Field,
  FieldId,
  Filter,
  FilterConditionProjection,
  FilterPresetId,
  FilterRule,
  FilterValuePreview,
  KanbanCardsPerColumn,
  RecordId,
  SortDirection,
  SortRule,
  View,
  ViewGroup,
  ViewGroupBucketId,
  ViewFilterRuleId,
  ViewId,
  ViewSortRuleId,
  ViewType
} from '@dataview/core/contracts'
import type { FilterEditorKind } from '@dataview/core/filter'
import type {
  CellRef,
  FieldList,
  ItemId,
  ItemPlacement,
  ItemList,
  MoveTarget,
  Section,
  SectionId,
  SectionList,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'

export interface FilterRuleProjection {
  rule: FilterRule
  field?: Field
  fieldMissing: boolean
  activePresetId: FilterPresetId
  effective: boolean
  editorKind: FilterEditorKind
  value: FilterValuePreview
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly FilterConditionProjection[]
}

export interface ViewFilterProjection {
  rules: readonly FilterRuleProjection[]
}

export interface ViewGroupProjection {
  fieldId: FieldId
  field?: Field
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty: boolean
  availableModes: readonly string[]
  availableBucketSorts: readonly BucketSort[]
  supportsInterval: boolean
}

export interface ViewSearchProjection {
  query: string
  fields?: readonly FieldId[]
}

export interface SortRuleProjection {
  rule: SortRule
  field?: Field
}

export interface ViewSortProjection {
  rules: readonly SortRuleProjection[]
}

export interface ActiveViewQuery {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group?: ViewGroupProjection
  sort: ViewSortProjection
}

export interface ActiveViewTable {
  wrap: boolean
  showVerticalLines: boolean
  calc: ReadonlyMap<FieldId, CalculationMetric | undefined>
}

export interface ActiveViewGallery {
  wrap: boolean
  size: CardSize
  layout: CardLayout
  canReorder: boolean
  groupUsesOptionColors: boolean
}

export interface ActiveViewKanban {
  wrap: boolean
  size: CardSize
  layout: CardLayout
  canReorder: boolean
  groupUsesOptionColors: boolean
  fillColumnColor: boolean
  cardsPerColumn: KanbanCardsPerColumn
}

export interface ViewState {
  view: View
  query: ActiveViewQuery
  records: ViewRecords
  sections: SectionList
  items: ItemList
  fields: FieldList
  table: ActiveViewTable
  gallery: ActiveViewGallery
  kanban: ActiveViewKanban
  summaries: ViewSummaries
}

export interface ViewCell {
  itemId: ItemId
  recordId: RecordId
  fieldId: FieldId
  sectionId: SectionId
  record: DataRecord
  field: Field | undefined
  value: unknown
}

export interface MovePlan {
  itemIds: readonly ItemId[]
  recordIds: readonly RecordId[]
  changed: boolean
  sectionChanged: boolean
  target: {
    section: SectionId
    before?: ItemId
    beforeRecord?: RecordId
  }
}

export interface ActiveViewReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined
  section: (sectionId: SectionId) => Section | undefined
  placement: (itemId: ItemId) => ItemPlacement | undefined
  cell: (cell: CellRef) => ViewCell | undefined
}

export interface GalleryApi {
  setWrap: (value: boolean) => void
  setSize: (value: CardSize) => void
  setLayout: (value: CardLayout) => void
}

export interface KanbanApi {
  setWrap: (value: boolean) => void
  setSize: (value: CardSize) => void
  setLayout: (value: CardLayout) => void
  setFillColor: (value: boolean) => void
  setCardsPerColumn: (value: KanbanCardsPerColumn) => void
}

export interface ActiveItemsApi {
  planMove: (
    itemIds: readonly ItemId[],
    target: MoveTarget
  ) => MovePlan
  move: (
    itemIds: readonly ItemId[],
    target: MoveTarget
  ) => void
  remove: (itemIds: readonly ItemId[]) => void
}

export interface ActiveRecordsApi {
  create: (input?: {
    section?: SectionId
    before?: ItemId
    values?: Partial<Record<FieldId, unknown>>
  }) => RecordId | undefined
}

export interface ActiveCellsApi {
  set: (cell: CellRef, value: unknown) => void
  clear: (cell: CellRef) => void
}

export interface ActiveViewApi {
  id: () => ViewId | undefined
  view: () => View | undefined
  state: () => ViewState | undefined
  read: ActiveViewReadApi
  changeType: (type: ViewType) => void
  search: {
    set: (query: string) => void
  }
  filters: {
    create: (fieldId: FieldId) => ViewFilterRuleId
    patch: (
      id: ViewFilterRuleId,
      patch: Partial<Pick<FilterRule, 'fieldId' | 'presetId' | 'value'>>
    ) => void
    setMode: (mode: Filter['mode']) => void
    remove: (id: ViewFilterRuleId) => void
    clear: () => void
  }
  sort: {
    create: (fieldId: FieldId, direction?: SortDirection) => ViewSortRuleId
    patch: (
      id: ViewSortRuleId,
      patch: Partial<Pick<SortRule, 'fieldId' | 'direction'>>
    ) => void
    move: (
      id: ViewSortRuleId,
      target: {
        before?: ViewSortRuleId | null
      }
    ) => void
    remove: (id: ViewSortRuleId) => void
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
  }
  sections: {
    show: (bucketId: ViewGroupBucketId) => void
    hide: (bucketId: ViewGroupBucketId) => void
    collapse: (bucketId: ViewGroupBucketId) => void
    expand: (bucketId: ViewGroupBucketId) => void
    toggleCollapse: (bucketId: ViewGroupBucketId) => void
  }
  summary: {
    set: (fieldId: FieldId, metric: CalculationMetric | null) => void
  }
  display: {
    replace: (fieldIds: readonly FieldId[]) => void
    move: (
      ids: readonly FieldId[],
      target: {
        before?: FieldId | null
      }
    ) => void
    show: (fieldId: FieldId, beforeFieldId?: FieldId | null) => void
    hide: (fieldId: FieldId) => void
    clear: () => void
  }
  table: {
    setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
    setVerticalLines: (value: boolean) => void
    setWrap: (value: boolean) => void
    insertField: (input: {
      anchor: FieldId
      side: 'left' | 'right'
      name?: string
      kind?: CustomFieldKind
    }) => CustomFieldId | undefined
  }
  gallery: GalleryApi
  kanban: KanbanApi
  records: ActiveRecordsApi
  items: ActiveItemsApi
  cells: ActiveCellsApi
}
