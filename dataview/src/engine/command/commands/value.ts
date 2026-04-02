import type { GroupBaseOperation } from '@/core/contracts/operations'
import type { GroupDocument } from '@/core/contracts/state'
import type { IndexedCommand } from '../context'
import {
  resolveCommandResult,
  resolveEditTargetRecordIds,
  validateEditTarget,
  validateValueApplyAction
} from './shared'

export const resolveValueApplyCommand = (
  document: GroupDocument,
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
          property: command.action.property,
          value: command.action.value
        } satisfies GroupBaseOperation
      case 'patch':
        return {
          type: 'document.value.patch',
          recordId,
          patch: command.action.patch
        } satisfies GroupBaseOperation
      case 'clear':
        return {
          type: 'document.value.clear',
          recordId,
          property: command.action.property
        } satisfies GroupBaseOperation
      default: {
        const unexpectedAction: never = command.action
        throw new Error(`Unsupported value.apply action: ${unexpectedAction}`)
      }
    }
  })

  return resolveCommandResult(issues, operations)
}
