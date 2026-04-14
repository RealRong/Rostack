import type {
  Action,
  BucketSort,
  CalculationMetric,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  Field,
  FieldId,
  FieldOption,
  Filter,
  FilterPresetId,
  FilterRule,
  GalleryCardSize,
  KanbanCardsPerColumn,
  KanbanNewRecordPosition,
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
  changes?: import('@dataview/core/contracts').CommitDelta
}

export interface CreatedEntities {
  records?: readonly RecordId[]
  fields?: readonly CustomFieldId[]
  views?: readonly ViewId[]
}

export interface ActionResult extends CommitResult {
  created?: CreatedEntities
}

export interface HistoryActionResult extends CommitResult {}

export const sameCellRef = (
  left: CellRef,
  right: CellRef
) => left.itemId === right.itemId && left.fieldId === right.fieldId

export interface FilterConditionProjection {
  id: FilterPresetId
  selected: boolean
}

export interface FilterRuleProjection {
  rule: FilterRule
  field?: Field
  fieldLabel: string
  activePresetId: FilterPresetId
  effective: boolean
  editorKind: FilterEditorKind
  valueText: string
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly FilterConditionProjection[]
}

export interface ViewFilterProjection {
  viewId: ViewId
  mode: Filter['mode']
  rules: readonly FilterRuleProjection[]
}

export interface ViewGroupProjection {
  viewId: ViewId
  active: boolean
  fieldId: FieldId | ''
  field?: Field
  fieldLabel: string
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty: boolean
  availableModes: readonly string[]
  availableBucketSorts: readonly BucketSort[]
  supportsInterval: boolean
}

export interface ViewSearchProjection {
  viewId: ViewId
  query: string
  fields?: readonly FieldId[]
  active: boolean
}

export interface SortRuleProjection {
  sorter: Sorter
  field?: Field
  fieldLabel: string
}

export interface ViewSortProjection {
  viewId: ViewId
  active: boolean
  rules: readonly SortRuleProjection[]
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

export interface GalleryState {
  groupUsesOptionColors: boolean
  canReorder: boolean
  cardSize: GalleryCardSize
}

export interface KanbanState {
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
}

export interface ActiveViewSelectApi {
  <T>(
    selector: (state: ViewState | undefined) => T,
    isEqual?: Equality<T>
  ): ReadStore<T>
}

export interface GalleryApi {
  state: ReadStore<GalleryState | undefined>
  setLabels: (value: boolean) => void
  setCardSize: (value: GalleryCardSize) => void
}

export interface KanbanApi {
  state: ReadStore<KanbanState | undefined>
  setNewRecordPosition: (value: KanbanNewRecordPosition) => void
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
  create: (input: {
    section: SectionKey
    title?: string
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (itemIds: readonly ItemId[]) => void
}

export interface ActiveCellsApi {
  set: (cell: CellRef, value: unknown) => void
  clear: (cell: CellRef) => void
}

export interface ActiveViewApi {
  id: ReadStore<ViewId | undefined>
  config: ReadStore<View | undefined>
  state: ReadStore<ViewState | undefined>
  select: ActiveViewSelectApi
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
  items: ActiveItemsApi
  cells: ActiveCellsApi
}

export interface DocumentEntitySelectApi<TId, T> {
  ids: ReadStore<readonly TId[]>
  all: ReadStore<readonly T[]>
  byId: KeyedReadStore<TId, T | undefined>
}

export interface DocumentSelectApi {
  document: ReadStore<DataDoc>
  records: DocumentEntitySelectApi<RecordId, DataRecord>
  fields: DocumentEntitySelectApi<CustomFieldId, CustomField>
  views: DocumentEntitySelectApi<ViewId, View>
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
  values: {
    set: (recordId: RecordId, fieldId: FieldId, value: unknown) => void
    clear: (recordId: RecordId, fieldId: FieldId) => void
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

export interface TraceDeltaSummary {
  summary: {
    records: boolean
    fields: boolean
    views: boolean
    values: boolean
    activeView: boolean
    indexes: boolean
  }
  semantics: readonly {
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
    groupMs?: number
    sortMs?: number
    summariesMs?: number
  }
  records: IndexStageTrace
  search: IndexStageTrace
  group: IndexStageTrace
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
    commitMs?: number
    indexMs?: number
    viewMs?: number
    snapshotMs?: number
  }
  delta: TraceDeltaSummary
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
    indexMs: RunningStat
    viewMs: RunningStat
  }
  indexes: Record<'records' | 'search' | 'group' | 'sort' | 'summaries', PerformanceCounter>
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
  select: DocumentSelectApi
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
