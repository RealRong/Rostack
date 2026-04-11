import type {
  CustomFieldId,
  EditTarget,
  ValueApplyAction,
  RecordId
} from '@dataview/core/contracts'
import type {
  Engine,
  RecordsEngineApi
} from '../types'

export const createRecordsEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'command'>
}): RecordsEngineApi => {
  const apply = (command: {
    target: EditTarget
    action: ValueApplyAction
  }) => {
    options.engine.command({
      type: 'value.apply',
      target: command.target,
      action: command.action
    })
  }

  return {
    get: recordId => options.engine.read.record.get(recordId),
    create: input => {
      const result = options.engine.command({
        type: 'record.create',
        input: {
          values: input?.values
        }
      })

      return result.created?.records?.[0]
    },
    remove: (recordId: RecordId) => {
      options.engine.command({
        type: 'record.remove',
        recordIds: [recordId]
      })
    },
    removeMany: recordIds => {
      const nextRecordIds = Array.from(new Set(recordIds))
      if (!nextRecordIds.length) {
        return
      }

      options.engine.command({
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
        action: {
          type: 'set',
          field: fieldId,
          value
        }
      })
    },
    clearValue: (recordId: RecordId, fieldId: CustomFieldId) => {
      apply({
        target: {
          type: 'record',
          recordId
        },
        action: {
          type: 'clear',
          field: fieldId
        }
      })
    },
    clearValues: input => {
      const recordIds = Array.from(new Set(input.recordIds))
      const fieldIds = Array.from(new Set(input.fieldIds))
      if (!recordIds.length || !fieldIds.length) {
        return
      }

      options.engine.command(fieldIds.map(fieldId => ({
        type: 'value.apply' as const,
        target: {
          type: 'records' as const,
          recordIds: [...recordIds]
        },
        action: {
          type: 'clear' as const,
          field: fieldId
        }
      })))
    },
    apply
  }
}
