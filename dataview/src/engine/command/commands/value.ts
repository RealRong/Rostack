import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { DataDoc } from '@dataview/core/contracts/state'
import type { IndexedCommand } from '../context'
import {
  resolveCommandResult,
  resolveEditTargetRecordIds,
  validateEditTarget,
  validateValueApplyAction
} from './shared'

export const resolveValueApplyCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'value.apply' }>
) => {
  const issues = [
    ...validateEditTarget(document, command, command.target),
    ...validateValueApplyAction(command, command.action)
  ]

  const operations = resolveEditTargetRecordIds(command.target).map(recordId => {
    switch (command.action.type) {
      case 'set':
        return {
          type: 'document.value.set',
          recordId,
          field: command.action.field,
          value: command.action.value
        } satisfies BaseOperation
      case 'patch':
        return {
          type: 'document.value.patch',
          recordId,
          patch: command.action.patch
        } satisfies BaseOperation
      case 'clear':
        return {
          type: 'document.value.clear',
          recordId,
          field: command.action.field
        } satisfies BaseOperation
      default: {
        const unexpectedAction: never = command.action
        throw new Error(`Unsupported value.apply action: ${unexpectedAction}`)
      }
    }
  })

  return resolveCommandResult(issues, operations)
}
