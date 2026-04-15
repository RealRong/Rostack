import type {
  CustomField,
  CustomFieldId,
  FieldId,
  RecordId,
  DataRecord,
  View,
  ViewId
} from '@dataview/core/contracts/state'
import type { RowInsertTarget } from '@dataview/core/contracts/operations'

export interface RecordFieldWriteManyCommandInput {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export type Command =
  | {
      type: 'record.insert'
      records: DataRecord[]
      target?: RowInsertTarget
    }
  | {
      type: 'record.patch'
      recordId: RecordId
      patch: Partial<Omit<DataRecord, 'id' | 'values'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'record.fields.writeMany'
      input: RecordFieldWriteManyCommandInput
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
