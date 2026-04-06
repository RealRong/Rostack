import type { CustomFieldId, CustomField, Row, View, RecordId, ViewId } from './state'

export interface RowInsertTarget {
  index?: number
}

export type ValuePatch = Partial<Record<CustomFieldId, unknown>>

export type BaseOperation =
  | {
      type: 'document.record.insert'
      records: Row[]
      target?: RowInsertTarget
    }
  | {
      type: 'document.record.patch'
      recordId: RecordId
      patch: Partial<Omit<Row, 'id'>>
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
      type: 'document.view.remove'
      viewId: ViewId
    }
  | {
      type: 'document.customField.put'
      field: CustomField
    }
  | {
      type: 'document.customField.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'document.customField.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'external.version.bump'
      source: string
    }

export type OperationType = BaseOperation['type']

export type OperationPayload<TType extends OperationType> = Omit<Extract<BaseOperation, { type: TType }>, 'type'>
