import type {
  CalculationMetric,
  FieldId,
  CustomFieldKind,
  CustomFieldId,
  CustomField,
  FilterPresetId,
  Row,
  StatusCategory,
  Filter,
  Search,
  Sorter,
  View,
  ViewCalc,
  ViewDisplay,
  ViewGroup,
  ViewType,
  RecordId,
  ViewId
} from './state'
import type { GalleryCardSize } from './gallery'
import type {
  KanbanCardsPerColumn,
  KanbanNewRecordPosition
} from './kanban'
import type { RowInsertTarget } from './operations'
import type { TableOptions, ViewOptions } from './viewOptions'

export type EditTarget =
  | {
      type: 'record'
      recordId: RecordId
    }
  | {
      type: 'records'
      recordIds: RecordId[]
    }

export type ValueApplyAction =
  | {
      type: 'set'
      field: CustomFieldId
      value: unknown
    }
  | {
      type: 'patch'
      patch: Record<string, unknown>
    }
  | {
      type: 'clear'
      field: CustomFieldId
    }

export interface RowCreateInput {
  id?: RecordId
  title?: string
  type?: string
  values?: Partial<Record<CustomFieldId, unknown>>
  meta?: Record<string, unknown>
}

export interface CustomFieldCreateInput {
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

export type Command =
  | {
      type: 'value.apply'
      target: EditTarget
      action: ValueApplyAction
    }
  | {
      type: 'record.create'
      input: RowCreateInput
    }
  | {
      type: 'customField.create'
      input: CustomFieldCreateInput
    }
  | {
      type: 'view.create'
      input: ViewCreateInput
    }
  | {
      type: 'view.put'
      view: View
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
      type: 'customField.put'
      field: CustomField
    }
  | {
      type: 'customField.convert'
      fieldId: CustomFieldId
      input: {
        kind: CustomFieldKind
      }
    }
  | {
      type: 'customField.replaceSchema'
      fieldId: CustomFieldId
      schema: CustomField
    }
  | {
      type: 'customField.duplicate'
      fieldId: CustomFieldId
    }
  | {
      type: 'customField.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'customField.option.remove'
      fieldId: CustomFieldId
      optionId: string
    }
  | {
      type: 'customField.option.create'
      fieldId: CustomFieldId
      input?: {
        name?: string
      }
    }
  | {
      type: 'customField.option.reorder'
      fieldId: CustomFieldId
      optionIds: string[]
    }
  | {
      type: 'customField.option.update'
      fieldId: CustomFieldId
      optionId: string
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    }
  | {
      type: 'customField.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'external.bumpVersion'
      source: string
    }
  | {
      type: 'record.insertAt'
      records: Row[]
      target?: RowInsertTarget
    }
  | {
      type: 'record.apply'
      target: EditTarget
      patch: Partial<Omit<Row, 'id'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }

export type CommandType = Command['type']

export type CommandPayload<TType extends CommandType> = Omit<Extract<Command, { type: TType }>, 'type'>
