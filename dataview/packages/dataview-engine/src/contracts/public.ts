import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  Action,
  BucketSort,
  CardLayout,
  CardSize,
  CalculationMetric,
  CommitSummary,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  Field,
  FieldId,
  FieldOption,
  Filter,
  FilterConditionProjection as FilterConditionProjectionCore,
  FilterValuePreview,
  FilterPresetId,
  FilterRule,
  KanbanCardsPerColumn,
  RecordFieldWriteManyInput,
  RecordId,
  DataRecord,
  SortDirection,
  Sorter,
  StatusCategory,
  View,
  ViewGroup,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type { FilterEditorKind } from '@dataview/core/filter'
import type {
  Equality,
  KeyedReadStore,
  KeyedStorePatch,
  ReadStore
} from '@shared/core'
import type {
  ValidationIssue
} from '@dataview/engine/mutate/issues'
import type {
  CellRef,
  FieldList,
  ItemId,
  ItemList,
  Placement,
  Section,
  SectionBucket,
  SectionKey,
  SectionList,
  ViewFieldRef,
  ViewItem,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'

export type { RecordFieldWriteManyInput } from '@dataview/core/contracts'

export type {
  CellRef,
  FieldList,
  ItemId,
  ItemList,
  Placement,
  Section,
  SectionBucket,
  SectionKey,
  SectionList,
  ViewFieldRef,
  ViewItem,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'

export interface CreateEngineOptions {
  document: DataDoc
  history?: HistoryOptions
  performance?: PerformanceOptions
}

export interface CommitResult {
  issues: readonly ValidationIssue[]
  applied: boolean
  summary?: CommitSummary
}

export interface CreatedEntities {
  records?: readonly RecordId[]
  fields?: readonly CustomFieldId[]
  views?: readonly ViewId[]
}

export interface ActionResult extends CommitResult {
  created?: CreatedEntities
}

export type HistoryActionResult = CommitResult

export const sameCellRef = (
  left: CellRef,
  right: CellRef
) => left.itemId === right.itemId && left.fieldId === right.fieldId

export type FilterConditionProjection = FilterConditionProjectionCore

export interface FilterRuleProjection {
  rule: FilterRule
  field?: Field
  fieldMissing: boolean
  activePresetId: FilterPresetId
  effective: boolean
  editorKind: FilterEditorKind
  value: FilterValuePreview
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly FilterConditionProjectionCore[]
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

export interface ViewState {
  view: View
  query: ActiveViewQuery
  records: ViewRecords
  sections: SectionList
  items: ItemList
  fields: FieldList
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
  item: (itemId: ItemId) => ViewItem | undefined
  cell: (cell: CellRef) => ViewCell | undefined
  filterField: (index: number) => Field | undefined
  groupField: () => Field | undefined
}

export interface EngineReadApi {
  document: () => DataDoc
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => CustomField | undefined
  view: (viewId: ViewId) => View | undefined
  activeViewId: () => ViewId | undefined
  activeView: () => View | undefined
  activeState: () => ViewState | undefined
}

export interface EntitySource<K, T> extends KeyedReadStore<K, T | undefined> {
  ids: ReadStore<readonly K[]>
}

export interface SectionSource extends KeyedReadStore<SectionKey, Section | undefined> {
  keys: ReadStore<readonly SectionKey[]>
  summary: KeyedReadStore<SectionKey, CalculationCollection | undefined>
}

export interface TableLayoutSectionState {
  key: SectionKey
  collapsed: boolean
  itemIds: readonly ItemId[]
}

export interface TableLayoutState {
  grouped: boolean
  rowCount: number
  sections: readonly TableLayoutSectionState[]
}

export interface ActiveQuerySource {
  search: ReadStore<ViewSearchProjection>
  filters: ReadStore<ViewFilterProjection>
  sort: ReadStore<ViewSortProjection>
  group: ReadStore<ViewGroupProjection>
  grouped: ReadStore<boolean>
  groupFieldId: ReadStore<FieldId | ''>
  filterFieldIds: ReadStore<readonly FieldId[]>
  sortFieldIds: ReadStore<readonly FieldId[]>
  sortDir: KeyedReadStore<FieldId, SortDirection | undefined>
}

export interface ActiveTableSource {
  wrap: ReadStore<boolean>
  showVerticalLines: ReadStore<boolean>
  calc: KeyedReadStore<FieldId, CalculationMetric | undefined>
  layout: ReadStore<TableLayoutState | null>
}

export interface ActiveGallerySource {
  wrap: ReadStore<boolean>
  size: ReadStore<CardSize>
  layout: ReadStore<CardLayout>
  canReorder: ReadStore<boolean>
  groupUsesOptionColors: ReadStore<boolean>
}

export interface ActiveKanbanSource {
  wrap: ReadStore<boolean>
  size: ReadStore<CardSize>
  layout: ReadStore<CardLayout>
  canReorder: ReadStore<boolean>
  groupUsesOptionColors: ReadStore<boolean>
  fillColumnColor: ReadStore<boolean>
  cardsPerColumn: ReadStore<KanbanCardsPerColumn>
}

export interface DocumentSource {
  records: EntitySource<RecordId, DataRecord>
  fields: EntitySource<FieldId, CustomField>
  views: EntitySource<ViewId, View>
}

export interface ActiveSource {
  view: {
    ready: ReadStore<boolean>
    id: ReadStore<ViewId | undefined>
    type: ReadStore<View['type'] | undefined>
    current: ReadStore<View | undefined>
  }
  items: EntitySource<ItemId, ViewItem>
  sections: SectionSource
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
  }
  query: ActiveQuerySource
  table: ActiveTableSource
  gallery: ActiveGallerySource
  kanban: ActiveKanbanSource
}

export interface EngineSource {
  doc: DocumentSource
  active: ActiveSource
}

export interface GalleryState {
  groupUsesOptionColors: boolean
  canReorder: boolean
  card: {
    wrap: boolean
    size: CardSize
    layout: CardLayout
  }
}

export interface KanbanState {
  groupUsesOptionColors: boolean
  card: {
    wrap: boolean
    size: CardSize
    layout: CardLayout
  }
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
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
    target: Placement
  ) => MovePlan
  move: (
    itemIds: readonly ItemId[],
    target: Placement
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
  id: ReadStore<ViewId | undefined>
  config: ReadStore<View | undefined>
  state: ReadStore<ViewState | undefined>
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

export interface DocumentChange {
  records: {
    changed: readonly RecordId[]
    removed: readonly RecordId[]
  }
  fields: {
    changed: readonly FieldId[]
    removed: readonly FieldId[]
  }
  views: {
    changed: readonly ViewId[]
    removed: readonly ViewId[]
  }
  activeViewChanged: boolean
}

export interface EntityDelta<TKey, TValue> {
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

export interface ViewPublishDelta {
  rebuild: boolean
  view?: {
    ready: boolean
    id?: ViewId
    type?: View['type']
    value?: View | undefined
  }
  query?: {
    search?: ViewSearchProjection
    filters?: ViewFilterProjection
    sort?: ViewSortProjection
    group?: ViewGroupProjection
    grouped?: boolean
    groupFieldId?: FieldId | ''
    filterFieldIds?: readonly FieldId[]
    sortFieldIds?: readonly FieldId[]
    sortDir?: ReadonlyMap<FieldId, SortDirection | undefined>
  }
  items?: {
    ids?: readonly ItemId[]
    values?: EntityDelta<ItemId, ViewItem>
  }
  sections?: {
    keys?: readonly SectionKey[]
    values?: EntityDelta<SectionKey, Section>
    summary?: EntityDelta<SectionKey, CalculationCollection | undefined>
  }
  fields?: {
    all?: readonly Field[]
    custom?: readonly CustomField[]
  }
  table?: {
    wrap?: boolean
    showVerticalLines?: boolean
    calc?: ReadonlyMap<FieldId, CalculationMetric | undefined>
  }
  gallery?: {
    wrap?: boolean
    size?: CardSize
    layout?: CardLayout
    canReorder?: boolean
    groupUsesOptionColors?: boolean
  }
  kanban?: {
    wrap?: boolean
    size?: CardSize
    layout?: CardLayout
    canReorder?: boolean
    groupUsesOptionColors?: boolean
    fillColumnColor?: boolean
    cardsPerColumn?: KanbanCardsPerColumn
  }
}

export interface SourceDelta {
  document?: {
    records?: {
      ids?: readonly RecordId[]
      values?: EntityDelta<RecordId, DataRecord>
    }
    fields?: {
      ids?: readonly FieldId[]
      values?: EntityDelta<FieldId, CustomField>
    }
    views?: {
      ids?: readonly ViewId[]
      values?: EntityDelta<ViewId, View>
    }
  }
  active?: {
    view?: {
      ready?: boolean
      id?: ViewId
      type?: View['type']
      value?: View | undefined
    }
    items?: {
      ids?: readonly ItemId[]
      values?: EntityDelta<ItemId, ViewItem>
    }
    sections?: {
      keys?: readonly SectionKey[]
      values?: EntityDelta<SectionKey, Section>
      summary?: EntityDelta<SectionKey, CalculationCollection | undefined>
    }
    fields?: {
      all?: {
        ids?: readonly FieldId[]
        values?: EntityDelta<FieldId, Field>
      }
      custom?: {
        ids?: readonly FieldId[]
        values?: EntityDelta<FieldId, CustomField>
      }
    }
    query?: {
      search?: ViewSearchProjection
      filters?: ViewFilterProjection
      sort?: ViewSortProjection
      group?: ViewGroupProjection
      grouped?: boolean
      groupFieldId?: FieldId | ''
      filterFieldIds?: readonly FieldId[]
      sortFieldIds?: readonly FieldId[]
      sortDir?: EntityDelta<FieldId, SortDirection>
    }
    table?: {
      wrap?: boolean
      showVerticalLines?: boolean
      calc?: EntityDelta<FieldId, CalculationMetric>
      layout?: TableLayoutState | null
    }
    gallery?: {
      wrap?: boolean
      size?: CardSize
      layout?: CardLayout
      canReorder?: boolean
      groupUsesOptionColors?: boolean
    }
    kanban?: {
      wrap?: boolean
      size?: CardSize
      layout?: CardLayout
      canReorder?: boolean
      groupUsesOptionColors?: boolean
      fillColumnColor?: boolean
      cardsPerColumn?: KanbanCardsPerColumn
    }
  }
}

export interface ViewsApi {
  list: () => readonly View[]
  get: (viewId: ViewId) => View | undefined
  open: (viewId: ViewId) => void
  create: (input: {
    name: string
    type: ViewType
  }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}

export interface FieldsApi {
  list: () => readonly CustomField[]
  get: (fieldId: CustomFieldId) => CustomField | undefined
  create: (input: {
    name: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  rename: (fieldId: CustomFieldId, name: string) => void
  update: (fieldId: CustomFieldId, patch: Partial<Omit<CustomField, 'id'>>) => void
  replace: (fieldId: CustomFieldId, field: CustomField) => void
  changeType: (
    fieldId: CustomFieldId,
    input: {
      kind: CustomFieldKind
    }
  ) => void
  duplicate: (fieldId: CustomFieldId) => CustomFieldId | undefined
  remove: (fieldId: CustomFieldId) => boolean
  options: {
    append: (fieldId: CustomFieldId) => FieldOption | undefined
    create: (fieldId: CustomFieldId, name: string) => FieldOption | undefined
    reorder: (fieldId: CustomFieldId, optionIds: readonly string[]) => void
    update: (
      fieldId: CustomFieldId,
      optionId: string,
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    ) => FieldOption | undefined
    remove: (fieldId: CustomFieldId, optionId: string) => void
  }
}

export interface RecordsApi {
  get: (recordId: RecordId) => DataRecord | undefined
  create: (input?: {
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (recordId: RecordId) => void
  removeMany: (recordIds: readonly RecordId[]) => void
  fields: {
    set: (recordId: RecordId, fieldId: FieldId, value: unknown) => void
    clear: (recordId: RecordId, fieldId: FieldId) => void
    writeMany: (input: RecordFieldWriteManyInput) => void
  }
}

export interface DocumentApi {
  export: () => DataDoc
  replace: (document: DataDoc) => DataDoc
}

export interface HistoryState {
  capacity: number
  undoDepth: number
  redoDepth: number
}

export interface HistoryOptions {
  capacity?: number
}

export interface HistoryApi {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => HistoryActionResult
  redo: () => HistoryActionResult
  clear: () => void
}

export interface PerformanceOptions {
  traces?: boolean | {
    capacity?: number
  }
  stats?: boolean
}

export type ViewStageAction =
  | 'reuse'
  | 'sync'
  | 'rebuild'

export type ViewStageName =
  | 'query'
  | 'sections'
  | 'summary'

export interface TraceImpactSummary {
  summary: {
    records: boolean
    fields: boolean
    views: boolean
    activeView: boolean
    external: boolean
    indexes: boolean
  }
  facts: readonly {
    kind: string
    count?: number
  }[]
  entities: {
    touchedRecordCount?: number | 'all'
    touchedFieldCount?: number | 'all'
    touchedViewCount?: number | 'all'
  }
}

export interface IndexStageTrace {
  action: 'reuse' | 'sync' | 'rebuild'
  changed: boolean
  inputSize?: number
  outputSize?: number
  touchedFieldCount?: number | 'all'
  touchedRecordCount?: number | 'all'
  durationMs: number
}

export interface IndexTrace {
  changed: boolean
  timings: {
    totalMs: number
    recordsMs?: number
    searchMs?: number
    bucketMs?: number
    sortMs?: number
    summariesMs?: number
  }
  records: IndexStageTrace
  search: IndexStageTrace
  bucket: IndexStageTrace
  sort: IndexStageTrace
  summaries: IndexStageTrace
}

export interface ViewStageMetrics {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}

export interface ViewStageTrace {
  stage: ViewStageName
  action: ViewStageAction
  executed: boolean
  changed: boolean
  durationMs: number
  deriveMs: number
  publishMs: number
  metrics?: ViewStageMetrics
}

export interface ViewPlanTrace {
  query: ViewStageAction
  sections: ViewStageAction
  summary: ViewStageAction
}

export interface ViewTrace {
  plan: ViewPlanTrace
  timings: {
    totalMs: number
  }
  stages: readonly ViewStageTrace[]
}

export interface SnapshotTrace {
  storeCount: number
  changedStores: readonly string[]
}

export interface CommitTrace {
  id: number
  kind: 'dispatch' | 'undo' | 'redo' | 'replace'
  timings: {
    totalMs: number
    planMs?: number
    commitMs?: number
    indexMs?: number
    viewMs?: number
    snapshotMs?: number
  }
  impact: TraceImpactSummary
  index: IndexTrace
  view: ViewTrace
  snapshot: SnapshotTrace
}

export interface RunningStat {
  count: number
  total: number
  avg: number
  max: number
  p95?: number
}

export interface PerformanceCounter {
  total: number
  changed: number
  rebuilt: number
}

export interface StagePerformanceStats {
  total: number
  reuse: number
  sync: number
  rebuild: number
  changed: number
  duration: RunningStat
}

export interface PerformanceStats {
  commits: {
    total: number
    dispatch: number
    undo: number
    redo: number
    replace: number
  }
  timings: {
    totalMs: RunningStat
    planMs: RunningStat
    indexMs: RunningStat
    viewMs: RunningStat
  }
  indexes: Record<'records' | 'search' | 'bucket' | 'sort' | 'summaries', PerformanceCounter>
  stages: Record<ViewStageName, StagePerformanceStats>
}

export interface PerformanceApi {
  traces: {
    last: () => CommitTrace | undefined
    list: (limit?: number) => readonly CommitTrace[]
    clear: () => void
  }
  stats: {
    snapshot: () => PerformanceStats
    clear: () => void
  }
}

export interface Engine {
  read: EngineReadApi
  source: EngineSource
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
