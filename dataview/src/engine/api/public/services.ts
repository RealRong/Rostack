import type {
  Action,
  BucketSort,
  CalculationMetric,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  FieldId,
  FieldOption,
  Filter,
  FilterRule,
  GalleryCardSize,
  KanbanCardsPerColumn,
  KanbanNewRecordPosition,
  RecordId,
  Row,
  SortDirection,
  Sorter,
  StatusCategory,
  View,
  ViewGroup,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  SectionKey
} from '../../project/readModels'
import type {
  CellRef,
  Placement
} from '../../project/refs'

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
  apply: (action: Extract<Action, { type: 'value.set' | 'value.patch' | 'value.clear' }>) => void
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
  setCardsPerColumn: (value: KanbanCardsPerColumn) => void
}

export interface ViewOrderApi {
  move: (recordIds: readonly RecordId[], beforeRecordId?: RecordId) => void
  clear: () => void
}

export interface ViewItemsApi {
  move: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => void
  create: (input: {
    section: SectionKey
    title?: string
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (appearanceIds: readonly AppearanceId[]) => void
}

export interface ViewCellsApi {
  set: (
    cell: CellRef,
    value: unknown
  ) => void
  clear: (cell: CellRef) => void
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
  cells: ViewCellsApi
}
