import type {
  Action,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  read,
  unique
} from '@shared/core'
import { createRecordFieldWriteAction } from '@dataview/core/field'
import type {
  ActionResult,
  DocumentReadApi,
  RecordsApi
} from '../contracts/public'

export const createRecordsApi = (options: {
  read: DocumentReadApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): RecordsApi => {
  const writeField = (
    recordId: RecordId,
    fieldId: FieldId,
    value: unknown | undefined
  ) => {
    options.dispatch(createRecordFieldWriteAction(recordId, fieldId, value))
  }

  return {
    get: recordId => read(options.read.record, recordId),
    create: input => {
      const result = options.dispatch({
        type: 'record.create',
        input: {
          values: input?.values
        }
      })

      return result.created?.records?.[0]
    },
    remove: (recordId: RecordId) => {
      options.dispatch({
        type: 'record.remove',
        recordIds: [recordId]
      })
    },
    removeMany: recordIds => {
      const nextRecordIds = unique(recordIds)
      if (!nextRecordIds.length) {
        return
      }

      options.dispatch({
        type: 'record.remove',
        recordIds: nextRecordIds
      })
    },
    values: {
      set: (recordId, fieldId, value) => {
        writeField(recordId, fieldId, value)
      },
      clear: (recordId, fieldId) => {
        writeField(recordId, fieldId, undefined)
      }
    }
  }
}
