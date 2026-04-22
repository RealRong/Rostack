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
  Sorter,
  View,
  ViewGroup,
  ViewId,
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
  SectionKey,
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
  active: boolean
  fieldId: FieldId | ''
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
  sorter: Sorter
  field?: Field
}

export interface ViewSortProjection {
  rules: readonly SortRuleProjection[]
}

const EMPTY_MODES = [] as readonly string[]
const EMPTY_BUCKET_SORTS = [] as readonly BucketSort[]
const EMPTY_QUERY_FIELD_IDS = [] as readonly FieldId[]

export const EMPTY_VIEW_GROUP_PROJECTION: ViewGroupProjection = {
  active: false,
  fieldId: '',
  field: undefined,
  mode: '',
  bucketSort: undefined,
  bucketInterval: undefined,
  showEmpty: true,
  availableModes: EMPTY_MODES,
  availableBucketSorts: EMPTY_BUCKET_SORTS,
  supportsInterval: false
}

export interface ActiveViewQuery {
  search: ViewSearchProjection
  filters: ViewFilterProjection
  group: ViewGroupProjection
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
  sectionKey: SectionKey
  record: DataRecord
  field: Field | undefined
  value: unknown
}

export const queryRead = {
  grouped: (
    query: ActiveViewQuery
  ): boolean => query.group.active,
  groupFieldId: (
    query: ActiveViewQuery
  ): FieldId | '' => query.group.fieldId,
  filterFieldIds: (
    query: ActiveViewQuery
  ): readonly FieldId[] => {
    const ids = query.filters.rules.flatMap(rule => (
      typeof rule.rule.fieldId === 'string'
        ? [rule.rule.fieldId]
        : []
    ))

    return ids.length
      ? ids
      : EMPTY_QUERY_FIELD_IDS
  },
  sortFieldIds: (
    query: ActiveViewQuery
  ): readonly FieldId[] => {
    const ids = query.sort.rules.flatMap(rule => (
      typeof rule.sorter.field === 'string'
        ? [rule.sorter.field]
        : []
    ))

    return ids.length
      ? ids
      : EMPTY_QUERY_FIELD_IDS
  },
  sortDir: (
    query: ActiveViewQuery,
    fieldId: FieldId
  ) => query.sort.rules.find(rule => rule.sorter.field === fieldId)?.sorter.direction
}

export const sameCellRef = (
  left: CellRef,
  right: CellRef
) => left.itemId === right.itemId && left.fieldId === right.fieldId

export interface MovePlan {
  itemIds: readonly ItemId[]
  recordIds: readonly RecordId[]
  changed: boolean
  sectionChanged: boolean
  target: {
    section: SectionKey
    beforeItemId?: ItemId
    beforeRecordId?: RecordId
  }
}

export interface ActiveViewReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined
  section: (sectionKey: SectionKey) => Section | undefined
  placement: (itemId: ItemId) => ItemPlacement | undefined
  cell: (cell: CellRef) => ViewCell | undefined
  filterField: (index: number) => Field | undefined
  groupField: () => Field | undefined
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
    sectionKey?: SectionKey
    before?: ItemId
    set?: Partial<Record<FieldId, unknown>>
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
    add: (fieldId: FieldId) => void
    update: (index: number, rule: FilterRule) => void
    setPreset: (index: number, presetId: string) => void
    setValue: (index: number, value: FilterRule['value'] | undefined) => void
    setMode: (mode: Filter['mode']) => void
    remove: (index: number) => void
    clear: () => void
  }
  sort: {
    add: (fieldId: FieldId, direction?: SortDirection) => void
    update: (fieldId: FieldId, direction: SortDirection) => void
    keepOnly: (fieldId: FieldId, direction: SortDirection) => void
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
  }
  sections: {
    show: (sectionKey: string) => void
    hide: (sectionKey: string) => void
    collapse: (sectionKey: string) => void
    expand: (sectionKey: string) => void
    toggleCollapse: (sectionKey: string) => void
  }
  summary: {
    set: (fieldId: FieldId, metric: CalculationMetric | null) => void
  }
  display: {
    replace: (fieldIds: readonly FieldId[]) => void
    move: (fieldIds: readonly FieldId[], beforeFieldId?: FieldId | null) => void
    show: (fieldId: FieldId, beforeFieldId?: FieldId | null) => void
    hide: (fieldId: FieldId) => void
    clear: () => void
  }
  table: {
    setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
    setVerticalLines: (value: boolean) => void
    setWrap: (value: boolean) => void
    insertFieldLeft: (
      anchorFieldId: FieldId,
      input?: {
        name?: string
        kind?: CustomFieldKind
      }
    ) => CustomFieldId | undefined
    insertFieldRight: (
      anchorFieldId: FieldId,
      input?: {
        name?: string
        kind?: CustomFieldKind
      }
    ) => CustomFieldId | undefined
  }
  gallery: GalleryApi
  kanban: KanbanApi
  records: ActiveRecordsApi
  items: ActiveItemsApi
  cells: ActiveCellsApi
}
