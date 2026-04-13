import type {
  CustomField,
  CustomFieldId,
  RecordId,
  DataRecord,
  View,
  ViewId
} from '#dataview-core/contracts/state'
import type { RowInsertTarget } from '#dataview-core/contracts/operations'

export type Command =
  | {
      type: 'record.insert'
      records: DataRecord[]
      target?: RowInsertTarget
    }
  | {
      type: 'record.patch'
      recordId: RecordId
      patch: Partial<Omit<DataRecord, 'id'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'value.set'
      recordId: RecordId
      field: CustomFieldId
      value: unknown
    }
  | {
      type: 'value.patch'
      recordId: RecordId
      patch: Record<string, unknown>
    }
  | {
      type: 'value.clear'
      recordId: RecordId
      field: CustomFieldId
    }
  | {
      type: 'field.put'
      field: CustomField
    }
  | {
      type: 'field.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'field.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'view.put'
      view: View
    }
  | {
      type: 'view.remove'
      viewId: ViewId
    }
  | {
      type: 'activeView.set'
      viewId: ViewId
    }
  | {
      type: 'external.bumpVersion'
      source: string
    }

export type CommandType = Command['type']
