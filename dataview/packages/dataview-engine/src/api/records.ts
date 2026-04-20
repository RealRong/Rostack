import type {
  Action,
  RecordId
} from '@dataview/core/contracts'
import {
  read,
  unique
} from '@shared/core'
import type {
  ActionResult,
  DocumentSource,
  RecordFieldWriteManyInput,
  RecordsApi
} from '@dataview/engine/contracts'

export const createRecordsApi = (options: {
  source: DocumentSource
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): RecordsApi => {
  const writeMany = (input: RecordFieldWriteManyInput) => {
    const recordIds = unique(input.recordIds)
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
    get: recordId => read(options.source.records, recordId),
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
