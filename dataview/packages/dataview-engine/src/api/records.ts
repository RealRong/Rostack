import type {
  DataRecord,
  RecordId
} from '@dataview/core/types'
import { collection } from '@shared/core'
import type {
  Engine,
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

export const createRecordsApi = (
  engine: Pick<Engine, 'doc' | 'execute'>
): RecordsApi => {
  const writeMany = (input: RecordFieldWriteManyInput) => {
    const recordIds = collection.unique(input.recordIds)
    if (!recordIds.length) {
      return
    }

    engine.execute({
      type: 'record.fields.writeMany',
      ...input,
      recordIds
    })
  }

  return {
    get: (id) => engine.doc().records.byId[id] as DataRecord | undefined,
    create: (input) => {
      const result = engine.execute({
        type: 'record.create',
        input: {
          values: input?.values
        }
      })

      return readId(result)
    },
    remove: (id: RecordId) => {
      engine.execute({
        type: 'record.remove',
        recordIds: [id]
      })
    },
    removeMany: (ids) => {
      const nextRecordIds = collection.unique(ids)
      if (!nextRecordIds.length) {
        return
      }

      engine.execute({
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
