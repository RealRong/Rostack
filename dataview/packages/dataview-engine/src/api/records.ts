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
  RecordFieldWriteManyInput,
  RecordsApi
} from '@dataview/engine/contracts/api'
import type {
  ActionResult
} from '@dataview/engine/contracts/result'

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
      ...input,
      recordIds
    })
  }

  return {
    get: id => documentApi.records.get(options.document(), id),
    create: input => {
      const result = options.dispatch({
        type: 'record.create',
        input: {
          values: input?.values
        }
      })

      return result.created?.records?.[0]
    },
    remove: (id: RecordId) => {
      options.dispatch({
        type: 'record.remove',
        recordIds: [id]
      })
    },
    removeMany: ids => {
      const nextRecordIds = collection.unique(ids)
      if (!nextRecordIds.length) {
        return
      }

      options.dispatch({
        type: 'record.remove',
        recordIds: nextRecordIds
      })
    },
    fields: {
      set: (record, field, value) => {
        writeMany({
          recordIds: [record],
          set: {
            [field]: value
          }
        })
      },
      clear: (record, field) => {
        writeMany({
          recordIds: [record],
          clear: [field]
        })
      },
      writeMany
    }
  }
}
