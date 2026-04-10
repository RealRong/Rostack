import type {
  FieldId,
  BucketSort,
  CalculationMetric,
  Command,
  CommitDelta,
  DataDoc,
  EditTarget,
  FilterRule,
  Filter,
  GalleryCardSize,
  CustomField,
  CustomFieldKind,
  FieldOption,
  KanbanNewRecordPosition,
  StatusCategory,
  Row,
  Search,
  SortDirection,
  Sorter,
  ValueApplyAction,
  View,
  ViewType,
  RecordId,
  ViewId,
  CustomFieldId,
  ViewGroup
} from '@dataview/core/contracts'
import type { ViewFilterProjection } from '@dataview/core/filter'
import type { ViewGroupProjection } from '@dataview/core/group'
import type { ViewSearchProjection } from '@dataview/core/search'
import type { ViewSortProjection } from '@dataview/core/sort'
import type { HistoryOptions, HistoryState } from './history'
import type { ValidationIssue } from '@dataview/engine/command'
import type { KeyedReadStore, ReadStore } from '@shared/store'
import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  AppearanceId,
  AppearanceList,
  FieldList,
  Placement,
  Section,
  SectionKey
} from '@dataview/engine/project/types'
import type {
  CellRef
} from '@dataview/engine/project'

export interface CreateEngineOptions {
  document: DataDoc
  history?: HistoryOptions
  perf?: EnginePerfOptions
}

export interface CommitResult {
  issues: ValidationIssue[]
  applied: boolean
  changes?: CommitDelta
}

export interface CreatedEntities {
  records?: readonly RecordId[]
  fields?: readonly CustomFieldId[]
  views?: readonly ViewId[]
}

export interface CommandResult extends CommitResult {
  created?: CreatedEntities
}
export interface HistoryActionResult extends CommitResult {}

export interface EngineReadApi {
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, Row | undefined>
  customFieldIds: ReadStore<readonly CustomFieldId[]>
  customField: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, View | undefined>
}

export interface ActiveView {
  id: ViewId
  name: string
  type: ViewType
}

export type FilterView = ViewFilterProjection
export type GroupView = ViewGroupProjection
export type SearchView = ViewSearchProjection
export type SortView = ViewSortProjection

export interface RecordSet {
  viewId: ViewId
  derivedIds: readonly RecordId[]
  orderedIds: readonly RecordId[]
  visibleIds: readonly RecordId[]
}

export interface EngineProjectApi {
  view: ReadStore<ActiveView | undefined>
  filter: ReadStore<FilterView | undefined>
  group: ReadStore<GroupView | undefined>
  search: ReadStore<SearchView | undefined>
  sort: ReadStore<SortView | undefined>
  records: ReadStore<RecordSet | undefined>
  sections: ReadStore<readonly Section[] | undefined>
  appearances: ReadStore<AppearanceList | undefined>
  fields: ReadStore<FieldList | undefined>
  calculations: ReadStore<ReadonlyMap<SectionKey, CalculationCollection> | undefined>
}

export interface EnginePerfOptions {
  trace?: boolean | {
    capacity?: number
  }
  stats?: boolean
}

export type ProjectStageAction =
  | 'reuse'
  | 'reconcile'
  | 'recompute'
  | 'rebuild'

export type ProjectStageName =
  | 'view'
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'records'
  | 'sections'
  | 'appearances'
  | 'fields'
  | 'calculations'

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
    calculationsMs?: number
  }
  records: IndexStageTrace
  search: IndexStageTrace
  group: IndexStageTrace
  sort: IndexStageTrace
  calculations: IndexStageTrace
}

export interface ProjectStageMetrics {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}

export interface ProjectStageTrace {
  stage: ProjectStageName
  action: ProjectStageAction
  executed: boolean
  changed: boolean
  durationMs: number
  metrics?: ProjectStageMetrics
}

export interface ProjectPlanTrace {
  view: ProjectStageAction
  search: ProjectStageAction
  filter: ProjectStageAction
  sort: ProjectStageAction
  group: ProjectStageAction
  records: ProjectStageAction
  sections: ProjectStageAction
  appearances: ProjectStageAction
  fields: ProjectStageAction
  calculations: ProjectStageAction
}

export interface ProjectTrace {
  plan: ProjectPlanTrace
  timings: {
    totalMs: number
  }
  stages: readonly ProjectStageTrace[]
}

export interface PublishTrace {
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
    projectMs?: number
    publishMs?: number
  }
  delta: TraceDeltaSummary
  index: IndexTrace
  project: ProjectTrace
  publish: PublishTrace
}

export interface RunningStat {
  count: number
  total: number
  avg: number
  max: number
  p95?: number
}

export interface PerfCounter {
  total: number
  changed: number
  rebuilt: number
}

export interface StagePerfStats {
  total: number
  reuse: number
  reconcile: number
  recompute: number
  rebuild: number
  changed: number
  duration: RunningStat
}

export interface PerfStats {
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
    projectMs: RunningStat
  }
  indexes: Record<'records' | 'search' | 'group' | 'sort' | 'calculations', PerfCounter>
  stages: Record<ProjectStageName, StagePerfStats>
}

export interface EnginePerfApi {
  trace: {
    last: () => CommitTrace | undefined
    list: (limit?: number) => readonly CommitTrace[]
    clear: () => void
  }
  stats: {
    snapshot: () => PerfStats
    clear: () => void
  }
}

export interface EngineHistoryApi {
  state: () => HistoryState
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => HistoryActionResult
  redo: () => HistoryActionResult
  clear: () => void
}

export interface EngineDocumentApi {
  export: () => DataDoc
  replace: (document: DataDoc) => DataDoc
}

export interface ViewsEngineApi {
  list: () => readonly View[]
  get: (viewId: ViewId) => View | undefined
  create: (input: {
    name: string
    type: ViewType
  }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}

export interface ViewAccessorApi {
  (viewId: ViewId): ViewEngineApi
  open: (viewId: ViewId) => void
}

export interface FieldsEngineApi {
  list: () => readonly CustomField[]
  get: (fieldId: CustomFieldId) => CustomField | undefined
  create: (input: {
    name: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  rename: (fieldId: CustomFieldId, name: string) => void
  update: (fieldId: CustomFieldId, patch: Partial<Omit<CustomField, 'id'>>) => void
  replaceSchema: (fieldId: CustomFieldId, schema: CustomField) => void
  convert: (
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
    reorder: (
      fieldId: CustomFieldId,
      optionIds: readonly string[]
    ) => void
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

export interface RecordsEngineApi {
  get: (recordId: RecordId) => Row | undefined
  create: (input?: {
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (recordId: RecordId) => void
  removeMany: (recordIds: readonly RecordId[]) => void
  setValue: (recordId: RecordId, fieldId: CustomFieldId, value: unknown) => void
  clearValue: (recordId: RecordId, fieldId: CustomFieldId) => void
  clearValues: (input: {
    recordIds: readonly RecordId[]
    fieldIds: readonly CustomFieldId[]
  }) => void
  apply: (command: {
    target: EditTarget
    action: ValueApplyAction
  }) => void
}

export interface ViewTableApi {
  setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
  setVerticalLines: (value: boolean) => void
}

export interface ViewGalleryApi {
  setLabels: (value: boolean) => void
  setCardSize: (value: GalleryCardSize) => void
}

export interface ViewKanbanApi {
  setNewRecordPosition: (value: KanbanNewRecordPosition) => void
  setFillColor: (value: boolean) => void
}

export interface ViewOrderApi {
  move: (recordIds: readonly RecordId[], beforeRecordId?: RecordId) => void
  clear: () => void
}

export interface ViewItemsApi {
  moveAppearances: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => void
  createInSection: (
    sectionKey: SectionKey,
    input?: {
      title?: string
      values?: Partial<Record<CustomFieldId, unknown>>
    }
  ) => RecordId | undefined
  removeAppearances: (appearanceIds: readonly AppearanceId[]) => void
  writeCell: (cell: CellRef, value: unknown | undefined) => void
}

export interface KanbanCreateCardInput {
  groupKey: string
  title: string
}

export interface KanbanMoveCardsInput {
  recordIds: readonly RecordId[]
  groupKey: string
  beforeRecordId?: RecordId
}

export interface KanbanApi {
  createCard: (input: KanbanCreateCardInput) => RecordId | undefined
  moveCards: (input: KanbanMoveCardsInput) => void
}

export interface ViewEngineApi {
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
  gallery: ViewGalleryApi
  kanban: ViewKanbanApi
  order: ViewOrderApi
  items: ViewItemsApi
  cards: KanbanApi
}

export interface Engine {
  read: EngineReadApi
  project: EngineProjectApi
  perf: EnginePerfApi
  command: (command: Command | readonly Command[]) => CommandResult
  history: EngineHistoryApi
  document: EngineDocumentApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  view: ViewAccessorApi
}
