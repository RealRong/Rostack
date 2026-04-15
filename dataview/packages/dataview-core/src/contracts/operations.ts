import type { CustomFieldId, CustomField, DataRecord, FieldId, View, RecordId, ViewId } from '@dataview/core/contracts/state'

export interface RowInsertTarget {
  index?: number
}

export interface RecordFieldWriteManyOperationInput {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export interface DocumentRecordFieldRestoreEntry {
  recordId: RecordId
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export type BaseOperation =
  | {
      type: 'document.record.insert'
      records: DataRecord[]
      target?: RowInsertTarget
    }
  | {
      type: 'document.record.patch'
      recordId: RecordId
      patch: Partial<Omit<DataRecord, 'id' | 'values'>>
    }
  | {
      type: 'document.record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'document.record.fields.writeMany'
      recordIds: readonly RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: readonly FieldId[]
    }
  | {
      type: 'document.record.fields.restoreMany'
      entries: readonly DocumentRecordFieldRestoreEntry[]
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
