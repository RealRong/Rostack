import type {
  Action,
  DataDoc,
  RecordId
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import { collection } from '@shared/core'
import type {
  ActionResult,
  RecordFieldWriteManyInput,
  RecordsApi
} from '@dataview/engine/contracts'

export const createRecordsApi = (options: {
  document: () => DataDoc
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): RecordsApi => {
  const writeMany = (input: RecordFieldWriteManyInput) => {
    const recordIds = collection.unique(input.recordIds)
    if (!recordIds.length) {
      return
    }

    options.dispatch({
      type: 'record.fields.writeMany',
      input: {
        ...input,
        recordIds
      }
    })
  }

  return {
    get: recordId => documentApi.records.get(options.document(), recordId),
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
      const nextRecordIds = collection.unique(recordIds)
      if (!nextRecordIds.length) {
        return
      }

      options.dispatch({
        type: 'record.remove',
        recordIds: nextRecordIds
      })
    },
    fields: {
      set: (recordId, fieldId, value) => {
        writeMany({
          recordIds: [recordId],
          set: {
            [fieldId]: value
          }
        })
      },
      clear: (recordId, fieldId) => {
        writeMany({
          recordIds: [recordId],
          clear: [fieldId]
        })
      },
      writeMany
    }
  }
}
