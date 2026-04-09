import type {
  FieldId,
  BucketSort,
  CalculationMetric,
  Command,
  CommitChangeSet,
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
  CellRef,
  FieldList,
  Placement,
  Section,
  SectionKey
} from '@dataview/engine/projection/view'

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
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, Row | undefined>
  customFieldIds: ReadStore<readonly CustomFieldId[]>
  customField: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, View | undefined>
}

export interface ActiveViewProjection {
  id: ViewId
  name: string
  type: ViewType
}

export interface ViewRecordSetProjection {
  viewId: ViewId
  derivedIds: readonly RecordId[]
  orderedIds: readonly RecordId[]
  visibleIds: readonly RecordId[]
}

export interface EngineProjectApi {
  view: ReadStore<ActiveViewProjection | undefined>
  filter: ReadStore<ViewFilterProjection | undefined>
  group: ReadStore<ViewGroupProjection | undefined>
  search: ReadStore<ViewSearchProjection | undefined>
  sort: ReadStore<ViewSortProjection | undefined>
  records: ReadStore<ViewRecordSetProjection | undefined>
  sections: ReadStore<readonly Section[] | undefined>
  appearances: ReadStore<AppearanceList | undefined>
  fields: ReadStore<FieldList | undefined>
  calculations: ReadStore<ReadonlyMap<SectionKey, CalculationCollection> | undefined>
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
  command: (command: Command | readonly Command[]) => CommandResult
  history: EngineHistoryApi
  document: EngineDocumentApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  view: ViewAccessorApi
}
