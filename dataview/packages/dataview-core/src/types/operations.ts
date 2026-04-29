import type {
  CustomField,
  CustomFieldId,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from './state'

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
      type: 'document.patch'
      patch: Partial<{
        schemaVersion: number
        activeViewId: ViewId | undefined
        meta: Record<string, unknown>
      }>
    }
  | {
      type: 'record.create'
      value: DataRecord
    }
  | {
      type: 'record.patch'
      id: RecordId
      patch: Partial<Omit<DataRecord, 'id' | 'values'>>
    }
  | {
      type: 'record.delete'
      id: RecordId
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'record.values.writeMany'
      recordIds: readonly RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: readonly FieldId[]
    }
  | {
      type: 'record.values.restoreMany'
      entries: readonly DocumentRecordFieldRestoreEntry[]
    }
  | {
      type: 'view.create'
      value: View
    }
  | {
      type: 'view.patch'
      id: ViewId
      patch: Partial<Omit<View, 'id'>>
    }
  | {
      type: 'view.delete'
      id: ViewId
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
      type: 'field.create'
      value: CustomField
    }
  | {
      type: 'field.patch'
      id: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'field.delete'
      id: CustomFieldId
    }
  | {
      type: 'field.remove'
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
