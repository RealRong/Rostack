import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataRecord,
  FieldId,
  Filter,
  GalleryView,
  KanbanView,
  RecordId,
  Search,
  Sort,
  StatusCategory,
  TableView,
  ViewCalc,
  ViewDisplay,
  ViewGroup,
  ViewId,
  ViewOptionsByType,
  ViewType,
  TableOptions
} from './state'

export type EditTarget =
  | {
      type: 'record'
      recordId: RecordId
    }
  | {
      type: 'records'
      recordIds: RecordId[]
    }

export interface RecordCreateInput {
  id?: RecordId
  title?: string
  type?: string
  values?: Partial<Record<CustomFieldId, unknown>>
  meta?: Record<string, unknown>
}

export interface FieldCreateInput {
  id?: CustomFieldId
  name: string
  kind?: CustomFieldKind
  meta?: Record<string, unknown>
}

export interface RecordFieldWriteManyInput {
  recordIds: RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export interface FieldOptionPatch {
  name?: string
  color?: string
  category?: StatusCategory
}

interface ViewCreateInputBase {
  id?: ViewId
  name: string
  search?: Search
  filter?: Filter
  sort?: Sort
  calc?: ViewCalc
  display?: ViewDisplay
  orders?: RecordId[]
}

export interface TableViewCreateInput extends ViewCreateInputBase {
  type: TableView['type']
  group?: ViewGroup
  options?: TableOptions
}

export interface GalleryViewCreateInput extends ViewCreateInputBase {
  type: GalleryView['type']
  group?: ViewGroup
  options?: ViewOptionsByType['gallery']
}

export interface KanbanViewCreateInput extends ViewCreateInputBase {
  type: KanbanView['type']
  group?: ViewGroup
  options?: ViewOptionsByType['kanban']
}

export type ViewCreateInput =
  | TableViewCreateInput
  | GalleryViewCreateInput
  | KanbanViewCreateInput

interface ViewPatchBase {
  name?: string
  type?: ViewType
  search?: Search
  filter?: Filter
  sort?: Sort
  calc?: ViewCalc
  display?: ViewDisplay
  orders?: RecordId[]
}

export interface TableViewPatch extends ViewPatchBase {
  type?: TableView['type']
  group?: ViewGroup | null
  options?: TableOptions
}

export interface GalleryViewPatch extends ViewPatchBase {
  type?: GalleryView['type']
  group?: ViewGroup | null
  options?: ViewOptionsByType['gallery']
}

export interface KanbanViewPatch extends ViewPatchBase {
  type?: KanbanView['type']
  group?: ViewGroup
  options?: ViewOptionsByType['kanban']
}

export type ViewPatch =
  | TableViewPatch
  | GalleryViewPatch
  | KanbanViewPatch

export type Intent =
  | {
      type: 'record.create'
      input: RecordCreateInput
    }
  | {
      type: 'record.patch'
      target: EditTarget
      patch: Partial<Omit<DataRecord, 'id' | 'values'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'record.fields.writeMany'
      recordIds: RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: readonly FieldId[]
    }
  | {
      type: 'field.create'
      input: FieldCreateInput
    }
  | {
      type: 'field.patch'
      id: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'field.replace'
      id: CustomFieldId
      field: CustomField
    }
  | {
      type: 'field.setKind'
      id: CustomFieldId
      kind: CustomFieldKind
    }
  | {
      type: 'field.duplicate'
      id: CustomFieldId
    }
  | {
      type: 'field.option.create'
      field: CustomFieldId
      name?: string
    }
  | {
      type: 'field.option.setOrder'
      field: CustomFieldId
      order: string[]
    }
  | {
      type: 'field.option.patch'
      field: CustomFieldId
      option: string
      patch: FieldOptionPatch
    }
  | {
      type: 'field.option.remove'
      field: CustomFieldId
      option: string
    }
  | {
      type: 'field.remove'
      id: CustomFieldId
    }
  | {
      type: 'view.create'
      input: ViewCreateInput
    }
  | {
      type: 'view.patch'
      id: ViewId
      patch: ViewPatch
    }
  | {
      type: 'view.open'
      id: ViewId
    }
  | {
      type: 'view.remove'
      id: ViewId
    }
  | {
      type: 'external.version.bump'
      source: string
    }

export type IntentType = Intent['type']
