import type {
  PropertyId,
  GroupEditTarget,
  GroupValueApplyAction,
  RecordId
} from '@dataview/core/contracts'
import type {
  GroupEngine,
  GroupRecordsEngineApi
} from '../types'

export const createRecordsEngineApi = (options: {
  engine: Pick<GroupEngine, 'read' | 'command'>
}): GroupRecordsEngineApi => {
  const apply = (command: {
    target: GroupEditTarget
    action: GroupValueApplyAction
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
    setValue: (recordId: RecordId, propertyId: PropertyId, value: unknown) => {
      apply({
        target: {
          type: 'record',
          recordId
        },
        action: {
          type: 'set',
          property: propertyId,
          value
        }
      })
    },
    clearValue: (recordId: RecordId, propertyId: PropertyId) => {
      apply({
        target: {
          type: 'record',
          recordId
        },
        action: {
          type: 'clear',
          property: propertyId
        }
      })
    },
    clearValues: input => {
      const recordIds = Array.from(new Set(input.recordIds))
      const propertyIds = Array.from(new Set(input.propertyIds))
      if (!recordIds.length || !propertyIds.length) {
        return
      }

      options.engine.command(propertyIds.map(propertyId => ({
        type: 'value.apply' as const,
        target: {
          type: 'records' as const,
          recordIds: [...recordIds]
        },
        action: {
          type: 'clear' as const,
          property: propertyId
        }
      })))
    },
    apply
  }
}
