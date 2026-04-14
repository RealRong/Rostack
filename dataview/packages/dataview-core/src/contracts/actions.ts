import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  Filter,
  RecordId,
  DataRecord,
  Search,
  Sorter,
  StatusCategory,
  ViewCalc,
  ViewDisplay,
  ViewGroup,
  ViewId,
  ViewType
} from '@dataview/core/contracts/state'
import type { ViewOptions } from '@dataview/core/contracts/viewOptions'

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

export interface ViewCreateInput {
  id?: ViewId
  name: string
  type: ViewType
  search?: Search
  filter?: Filter
  sort?: Sorter[]
  group?: ViewGroup
  calc?: ViewCalc
  display?: ViewDisplay
  options?: ViewOptions
  orders?: RecordId[]
}

export interface ViewPatch {
  name?: string
  type?: ViewType
  search?: Search
  filter?: Filter
  sort?: Sorter[]
  group?: ViewGroup | null
  calc?: ViewCalc
  display?: ViewDisplay
  options?: ViewOptions
  orders?: RecordId[]
}

export type Action =
  | {
      type: 'record.create'
      input: RowCreateInput
    }
  | {
      type: 'record.patch'
      target: EditTarget
      patch: Partial<Omit<DataRecord, 'id'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'value.set'
      target: EditTarget
      field: CustomFieldId
      value: unknown
    }
  | {
      type: 'value.patch'
      target: EditTarget
      patch: Record<string, unknown>
    }
  | {
      type: 'value.clear'
      target: EditTarget
      field: CustomFieldId
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
