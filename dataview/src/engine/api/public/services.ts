import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  FieldId,
  FieldOption,
  GalleryCardSize,
  KanbanCardsPerColumn,
  KanbanNewRecordPosition,
  RecordId,
  DataRecord,
  StatusCategory,
  View,
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
  open: (viewId: ViewId) => void
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
  get: (recordId: RecordId) => DataRecord | undefined
  create: (input?: {
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (recordId: RecordId) => void
  removeMany: (recordIds: readonly RecordId[]) => void
  field: {
    set: (recordId: RecordId, fieldId: FieldId, value: unknown) => void
    clear: (recordId: RecordId, fieldId: FieldId) => void
  }
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
