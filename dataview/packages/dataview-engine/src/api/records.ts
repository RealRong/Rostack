import type {
  DataDoc,
  Intent as CoreIntent,
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
  ExecuteResult,
} from '@dataview/engine/types/intent'

const readId = (
  result: ExecuteResult
): string | undefined => result.ok
  && typeof result.data === 'object'
  && result.data !== null
  && 'id' in result.data
    ? String(result.data.id)
    : undefined

export const createRecordsApi = (options: {
  document: () => DataDoc
  execute: (intent: CoreIntent) => ExecuteResult
}): RecordsApi => {
  const writeMany = (input: RecordFieldWriteManyInput) => {
    const recordIds = collection.unique(input.recordIds)
    if (!recordIds.length) {
      return
    }

    options.execute({
      type: 'record.fields.writeMany',
      ...input,
      recordIds
    })
  }

  return {
    get: (id) => documentApi.records.get(options.document(), id),
    create: (input) => {
      const result = options.execute({
        type: 'record.create',
        input: {
          values: input?.values
        }
      })

      return readId(result)
    },
    remove: (id: RecordId) => {
      options.execute({
        type: 'record.remove',
        recordIds: [id]
      })
    },
    removeMany: (ids) => {
      const nextRecordIds = collection.unique(ids)
      if (!nextRecordIds.length) {
        return
      }

      options.execute({
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
