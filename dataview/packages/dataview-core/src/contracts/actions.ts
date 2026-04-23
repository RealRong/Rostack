import type {
  CustomField,
  CustomFieldId,
  GalleryView,
  CustomFieldKind,
  FieldId,
  Filter,
  KanbanView,
  RecordId,
  DataRecord,
  Search,
  Sort,
  StatusCategory,
  TableView,
  ViewCalc,
  ViewDisplay,
  ViewGroup,
  ViewId,
  ViewType
} from '@dataview/core/contracts/state'
import type {
  TableOptions,
  ViewOptionsByType
} from '@dataview/core/contracts/viewOptions'

export type EditTarget =
  | {
      type: 'record'
      recordId: RecordId
    }
  | {
      type: 'records'
      recordIds: RecordId[]
    }

export interface RowCreateInput {
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

export type Action =
  | {
      type: 'record.create'
      input: RowCreateInput
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
      input: RecordFieldWriteManyInput
    }
  | {
      type: 'field.create'
      input: FieldCreateInput
    }
  | {
      type: 'field.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'field.replace'
      fieldId: CustomFieldId
      field: CustomField
    }
  | {
      type: 'field.convert'
      fieldId: CustomFieldId
      input: {
        kind: CustomFieldKind
      }
    }
  | {
      type: 'field.duplicate'
      fieldId: CustomFieldId
    }
  | {
      type: 'field.option.create'
      fieldId: CustomFieldId
      input?: {
        name?: string
      }
    }
  | {
      type: 'field.option.reorder'
      fieldId: CustomFieldId
      optionIds: string[]
    }
  | {
      type: 'field.option.update'
      fieldId: CustomFieldId
      optionId: string
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    }
  | {
      type: 'field.option.remove'
      fieldId: CustomFieldId
      optionId: string
    }
  | {
      type: 'field.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'view.create'
      input: ViewCreateInput
    }
  | {
      type: 'view.patch'
      viewId: ViewId
      patch: ViewPatch
    }
  | {
      type: 'view.open'
      viewId: ViewId
    }
  | {
      type: 'view.remove'
      viewId: ViewId
    }
  | {
      type: 'external.bumpVersion'
      source: string
    }

export type ActionType = Action['type']
