import type { DataDoc } from '@dataview/core/contracts/state'
import type { IndexedCommand } from '../context'
import { createIssue } from '../issues'
import { resolveCommandResult, isNonEmptyString } from './shared'

export const resolveExternalBumpCommand = (
  _document: DataDoc,
  command: Extract<IndexedCommand, { type: 'external.bumpVersion' }>
) => {
  const issues = isNonEmptyString(command.source)
    ? []
    : [createIssue(command, 'error', 'external.invalidSource', 'external.bumpVersion requires a non-empty source', 'source')]

  return resolveCommandResult(issues, [
    {
      type: 'external.version.bump',
      source: command.source
    }
  ])
}
