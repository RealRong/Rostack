import type {
  Action,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import { isTitleFieldId } from '@dataview/core/field'
import type {
  EngineReadApi,
  RecordsEngineApi
} from '../api/public'
import type { ActionResult } from '../api/public/command'

export const createRecordsEngineApi = (options: {
  read: EngineReadApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): RecordsEngineApi => {
  const writeField = (
    recordId: RecordId,
    fieldId: FieldId,
    value: unknown | undefined
  ) => {
    if (isTitleFieldId(fieldId)) {
      options.dispatch({
        type: 'record.patch',
        target: {
          type: 'record',
          recordId
        },
        patch: {
          title: value === undefined
            ? ''
            : String(value ?? '')
        }
      })
      return
    }

    options.dispatch(value === undefined
      ? {
          type: 'value.clear',
          target: {
            type: 'record',
            recordId
          },
          field: fieldId
        }
      : {
          type: 'value.set',
          target: {
            type: 'record',
            recordId
          },
          field: fieldId,
          value
        })
  }

  return {
    get: recordId => options.read.record.get(recordId),
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
      const nextRecordIds = Array.from(new Set(recordIds))
      if (!nextRecordIds.length) {
        return
      }

      options.dispatch({
        type: 'record.remove',
        recordIds: nextRecordIds
      })
    },
    field: {
      set: (recordId, fieldId, value) => {
        writeField(recordId, fieldId, value)
      },
      clear: (recordId, fieldId) => {
        writeField(recordId, fieldId, undefined)
      }
    }
  }
}
