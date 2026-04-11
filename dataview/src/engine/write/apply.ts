import {
  createDeltaCollector
} from '@dataview/core/commit/collector'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  BaseOperation
} from '@dataview/core/contracts/operations'
import {
  applyOperations
} from '@dataview/core/operation'
import type {
  ResolvedWriteBatch
} from '../command'
import type {
  CommandResult,
  CommitResult,
  CreatedEntities
} from '../types'

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

export const applyReplay = (
  beforeDocument: DataDoc,
  operations: readonly BaseOperation[]
) => applyOperations(beforeDocument, operations)

export const rejectedResult = (
  issues: CommandResult['issues']
): CommandResult => ({
  issues,
  applied: false
})

export const emptyResult = (): CommitResult => ({
  issues: [],
  applied: false
})
