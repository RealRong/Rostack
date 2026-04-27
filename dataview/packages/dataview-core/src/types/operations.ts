import type {
  CustomField,
  CustomFieldId,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from './state'

export interface RecordInsertTarget {
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

export type DocumentOperation =
  | {
      type: 'document.record.insert'
      records: DataRecord[]
      target?: RecordInsertTarget
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
      id?: ViewId
    }
  | {
      type: 'document.view.remove'
      id: ViewId
    }
  | {
      type: 'document.field.put'
      field: CustomField
    }
  | {
      type: 'document.field.patch'
      id: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'document.field.remove'
      id: CustomFieldId
    }
  | {
      type: 'external.version.bump'
      source: string
    }

export type OperationType = DocumentOperation['type']

export type OperationPayload<TType extends OperationType> = Omit<
  Extract<DocumentOperation, { type: TType }>,
  'type'
>
