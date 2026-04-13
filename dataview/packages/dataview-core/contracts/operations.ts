import type { CustomFieldId, CustomField, DataRecord, View, RecordId, ViewId } from './state'

export interface RowInsertTarget {
  index?: number
}

export type ValuePatch = Partial<Record<CustomFieldId, unknown>>

export type BaseOperation =
  | {
      type: 'document.record.insert'
      records: DataRecord[]
      target?: RowInsertTarget
    }
  | {
      type: 'document.record.patch'
      recordId: RecordId
      patch: Partial<Omit<DataRecord, 'id'>>
    }
  | {
      type: 'document.record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'document.value.set'
      recordId: RecordId
      field: CustomFieldId
      value: unknown
    }
  | {
      type: 'document.value.patch'
      recordId: RecordId
      patch: ValuePatch
    }
  | {
      type: 'document.value.clear'
      recordId: RecordId
      field: CustomFieldId
    }
  | {
      type: 'document.view.put'
      view: View
    }
  | {
      type: 'document.activeView.set'
      viewId?: ViewId
    }
  | {
      type: 'document.view.remove'
      viewId: ViewId
    }
  | {
      type: 'document.field.put'
      field: CustomField
    }
  | {
      type: 'document.field.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'document.field.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'external.version.bump'
      source: string
    }

export type OperationType = BaseOperation['type']

export type OperationPayload<TType extends OperationType> = Omit<Extract<BaseOperation, { type: TType }>, 'type'>
