import type {
  Action,
  CustomFieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  Engine,
  RecordsEngineApi
} from '../api/public'

export const createRecordsEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'action'>
}): RecordsEngineApi => {
  const apply = (action: Extract<Action, { type: 'value.set' | 'value.patch' | 'value.clear' }>) => {
    options.engine.action(action)
  }

  return {
    get: recordId => options.engine.read.record.get(recordId),
    create: input => {
      const result = options.engine.action({
        type: 'record.create',
        input: {
          values: input?.values
        }
      })

      return result.created?.records?.[0]
    },
    remove: (recordId: RecordId) => {
      options.engine.action({
        type: 'record.remove',
        recordIds: [recordId]
      })
    },
    removeMany: recordIds => {
      const nextRecordIds = Array.from(new Set(recordIds))
      if (!nextRecordIds.length) {
        return
      }

      options.engine.action({
        type: 'record.remove',
        recordIds: nextRecordIds
      })
    },
    setValue: (recordId: RecordId, fieldId: CustomFieldId, value: unknown) => {
      apply({
        target: {
          type: 'record',
          recordId
        },
        type: 'value.set',
        field: fieldId,
        value
      })
    },
    clearValue: (recordId: RecordId, fieldId: CustomFieldId) => {
      apply({
        target: {
          type: 'record',
          recordId
        },
        type: 'value.clear',
        field: fieldId
      })
    },
    clearValues: input => {
      const recordIds = Array.from(new Set(input.recordIds))
      const fieldIds = Array.from(new Set(input.fieldIds))
      if (!recordIds.length || !fieldIds.length) {
        return
      }

      options.engine.action(fieldIds.map(fieldId => ({
        type: 'value.clear' as const,
        target: {
          type: 'records' as const,
          recordIds: [...recordIds]
        },
        field: fieldId
      })))
    },
    apply
  }
}
