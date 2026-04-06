import type {
  FieldId,
  BucketSort,
  Command,
  CommitChangeSet,
  DataDoc,
  EditTarget,
  FilterRule,
  GalleryCardSize,
  Grouping,
  CustomField,
  CustomFieldKind,
  FieldOption,
  KanbanNewRecordPosition,
  StatusCategory,
  Row,
  SortDirection,
  Sorter,
  ValueApplyAction,
  View,
  ViewType,
  RecordId,
  ViewId,
  CustomFieldId
} from '@dataview/core/contracts'
import type { HistoryOptions, HistoryState } from './history'
import type { ValidationIssue } from '@dataview/engine/command'
import type { KeyedReadStore, ReadStore } from '@dataview/runtime/store'
import type { ViewProjection } from '@dataview/engine/projection/view'

export interface CreateEngineOptions {
  document: DataDoc
  history?: HistoryOptions
}

export interface CommitResult {
  issues: ValidationIssue[]
  applied: boolean
  changes?: CommitChangeSet
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
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, Row | undefined>
  customFieldIds: ReadStore<readonly CustomFieldId[]>
  customField: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, View | undefined>
  viewProjection: KeyedReadStore<ViewId, ViewProjection | undefined>
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

export interface ViewQueryApi {
  setSearchQuery: (value: string) => void
  addFilter: (fieldId: FieldId) => void
  setFilter: (index: number, rule: FilterRule) => void
  removeFilter: (index: number) => void
  addSorter: (fieldId: FieldId, direction?: SortDirection) => void
  setSorter: (fieldId: FieldId, direction: SortDirection) => void
  setOnlySorter: (fieldId: FieldId, direction: SortDirection) => void
  replaceSorter: (index: number, sorter: Sorter) => void
  removeSorter: (index: number) => void
  moveSorter: (from: number, to: number) => void
  clearSorters: () => void
  setGroup: (fieldId: FieldId) => void
  clearGroup: () => void
  toggleGroup: (fieldId: FieldId) => void
  setGroupMode: (mode: string) => void
  setGroupBucketSort: (bucketSort: BucketSort) => void
  setGroupBucketInterval: (bucketInterval: Grouping['bucketInterval']) => void
  setGroupShowEmpty: (showEmpty: boolean) => void
  setGroupBucketHidden: (key: string, hidden: boolean) => void
  setGroupBucketCollapsed: (key: string, collapsed: boolean) => void
  toggleGroupBucketCollapsed: (key: string) => void
}

export interface ViewDisplayApi {
  setFieldIds: (fieldIds: readonly FieldId[]) => void
  moveFieldIds: (
    fieldIds: readonly FieldId[],
    beforeFieldId?: FieldId | null
  ) => void
  showField: (
    fieldId: FieldId,
    beforeFieldId?: FieldId | null
  ) => void
  hideField: (fieldId: FieldId) => void
}

export interface ViewTableApi {
  setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
  setShowVerticalLines: (checked: boolean) => void
}

export interface ViewGalleryApi {
  setShowPropertyLabels: (checked: boolean) => void
  setCardSize: (value: GalleryCardSize) => void
}

export interface ViewKanbanApi {
  setNewRecordPosition: (value: KanbanNewRecordPosition) => void
  setFillColumnColor: (checked: boolean) => void
}

export interface ViewSettingsApi {
  display: ViewDisplayApi
  table: ViewTableApi
  gallery: ViewGalleryApi
  kanban: ViewKanbanApi
}

export interface ViewOrderApi {
  move: (recordIds: readonly RecordId[], beforeRecordId?: RecordId) => void
  clear: () => void
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
  setType: (type: ViewType) => void
  search: {
    setQuery: (value: string) => void
  }
  filters: {
    add: (fieldId: FieldId) => void
    update: (index: number, rule: FilterRule) => void
    remove: (index: number) => void
    clear: () => void
  }
  sorters: {
    add: (fieldId: FieldId, direction?: SortDirection) => void
    move: (from: number, to: number) => void
    replace: (index: number, sorter: Sorter) => void
    remove: (index: number) => void
    clear: () => void
    setOnly: (fieldId: FieldId, direction: SortDirection) => void
  }
  grouping: {
    setField: (fieldId: FieldId) => void
    clear: () => void
    setMode: (mode: string) => void
    setBucketSort: (bucketSort: BucketSort) => void
    setBucketInterval: (bucketInterval: Grouping['bucketInterval']) => void
    setShowEmpty: (showEmpty: boolean) => void
    setBucketHidden: (key: string, hidden: boolean) => void
    setBucketCollapsed: (key: string, collapsed: boolean) => void
    toggleBucketCollapsed: (key: string) => void
  }
  display: {
    setVisibleFields: (fieldIds: readonly FieldId[]) => void
    moveVisibleFields: (
      fieldIds: readonly FieldId[],
      beforeFieldId?: FieldId | null
    ) => void
    showField: (
      fieldId: FieldId,
      beforeFieldId?: FieldId | null
    ) => void
    hideField: (fieldId: FieldId) => void
  }
  table: {
    setColumnWidths: (widths: Partial<Record<FieldId, number>>) => void
    insertColumnLeftOf: (
      anchorFieldId: FieldId,
      input?: {
        name?: string
        kind?: CustomFieldKind
      }
    ) => CustomFieldId | undefined
    insertColumnRightOf: (
      anchorFieldId: FieldId,
      input?: {
        name?: string
        kind?: CustomFieldKind
      }
    ) => CustomFieldId | undefined
  }
  query: ViewQueryApi
  settings: ViewSettingsApi
  order: ViewOrderApi
  kanban: KanbanApi
}

export interface Engine {
  read: EngineReadApi
  command: (command: Command | readonly Command[]) => CommandResult
  history: EngineHistoryApi
  document: EngineDocumentApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  view: (viewId: ViewId) => ViewEngineApi
}
