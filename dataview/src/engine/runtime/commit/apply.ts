import {
  createDeltaCollector
} from '@dataview/core/commit/collector'
import {
  applyOperations
} from '@dataview/core/operation'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type { ResolvedWriteBatch } from '@dataview/engine/command'
import type {
  CreatedEntities,
  CommitResult,
  CommandResult
} from '../../types'
import type { HistoryReplay } from './history'

export const createdFromChanges = (
  changes?: CommitResult['changes']
): CreatedEntities | undefined => {
  if (!changes) {
    return undefined
  }

  const created = {
    records: changes.entities.records?.add,
    fields: changes.entities.fields?.add,
    views: changes.entities.views?.add
  }

  return created.records?.length || created.fields?.length || created.views?.length
    ? created
    : undefined
}

export const applyWriteBatch = (
  beforeDocument: DataDoc,
  writeBatch: ResolvedWriteBatch
) => applyOperations(
  beforeDocument,
  writeBatch.operations,
  createDeltaCollector(beforeDocument, writeBatch.deltaDraft)
)

export const createRejectedCommandResult = (
  issues: CommandResult['issues']
): CommandResult => ({
  issues,
  applied: false
})

export const createEmptyCommitResult = (): CommitResult => ({
  issues: [],
  applied: false
})

export const applyHistoryReplay = (
  beforeDocument: DataDoc,
  replay: HistoryReplay
) => applyOperations(beforeDocument, replay.operations)
