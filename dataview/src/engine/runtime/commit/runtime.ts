import type { HistoryState } from '@dataview/engine/history'
import type { DataDoc } from '@dataview/core/contracts'
import { cloneDocument } from '@dataview/core/document'
import { createResetDelta } from '@dataview/core/commit/delta'
import { createDeltaCollector } from '@dataview/core/commit/collector'
import { applyOperations } from '@dataview/core/operation'
import type { ResolvedWriteBatch } from '@dataview/engine/command'
import type { CommitResult, CreatedEntities, CommandResult } from '../../types'
import type { ReadRuntime } from '../read/read'
import type { HistoryReplay } from './history'
import { historyStacks } from './history'
import type { ProjectRuntime } from '../../project/source'

interface CommitDocumentStore {
  peekDocument: () => DataDoc
  installDocument: (document: DataDoc) => DataDoc
}

export interface CommitRuntimeOptions {
  document: CommitDocumentStore
  read: Pick<ReadRuntime, 'clear' | 'syncDocument'>
  project: Pick<ProjectRuntime, 'clear' | 'syncDocument'>
  historyCapacity: number
}

export interface CommitRuntime {
  history: {
    state: () => HistoryState
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
    undo: () => CommitResult
    redo: () => CommitResult
  }
  dispatch: (writeBatch: ResolvedWriteBatch) => CommandResult
  replace: (document: DataDoc) => void
}

const createdFromChanges = (changes?: CommitResult['changes']): CreatedEntities | undefined => {
  if (!changes) {
    return undefined
  }

  const created: CreatedEntities = {
    records: changes.entities.records?.add,
    fields: changes.entities.fields?.add,
    views: changes.entities.views?.add
  }

  return created.records?.length || created.fields?.length || created.views?.length
    ? created
    : undefined
}

export const commitRuntime = (options: CommitRuntimeOptions): CommitRuntime => {
  const store = options.document
  const history = historyStacks({
    capacity: options.historyCapacity
  })
  const finalize = <TResult extends CommitResult>(result: TResult, shouldSyncDocument: boolean): TResult => {
    if (shouldSyncDocument) {
      options.read.syncDocument(store.peekDocument(), result.changes)
      options.project.syncDocument(store.peekDocument(), result.changes)
    }
    return result
  }

  const dispatch = (writeBatch: ResolvedWriteBatch): CommandResult => {
    if (!writeBatch.canApply) {
      return finalize(
        {
          issues: writeBatch.issues,
          applied: false
        },
        false
      )
    }

    if (!writeBatch.operations.length) {
      return finalize(
        {
          issues: writeBatch.issues,
          applied: false
        },
        false
      )
    }

    const beforeDocument = store.peekDocument()
    const applied = applyOperations(
      beforeDocument,
      writeBatch.operations,
      createDeltaCollector(beforeDocument, writeBatch.deltaDraft)
    )
    const { undo, redo, document: afterDocument, delta } = applied
    store.installDocument(afterDocument)

    history.clearRedo()
    if (options.historyCapacity > 0) {
      history.pushUndo({ undo, redo })
    }

    return finalize(
      {
        issues: writeBatch.issues,
        applied: true,
        changes: delta,
        created: createdFromChanges(delta)
      },
      true
    )
  }

  const replay = (replay?: HistoryReplay): CommitResult => {
    const entry = replay
    const beforeDocument = store.peekDocument()

    if (!entry) {
      return finalize(
        {
          issues: [],
          applied: false
        },
        false
      )
    }

    const { document: afterDocument, delta } = applyOperations(beforeDocument, entry.operations)
    store.installDocument(afterDocument)

    return finalize(
      {
        issues: [],
        applied: true,
        changes: delta
      },
      true
    )
  }

  const historyApi = {
    state: () => history.getState(),
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    clear: () => {
      history.clear()
    },
    undo: () => replay(history.undo()),
    redo: () => replay(history.redo())
  }

  return {
    history: historyApi,
    dispatch,
    replace: document => {
      const beforeDocument = store.peekDocument()
      const nextDocument = cloneDocument(document)
      const delta = createResetDelta(beforeDocument, nextDocument)

      history.clear()
      options.read.clear()
      options.project.clear()
      store.installDocument(nextDocument)
      options.read.syncDocument(nextDocument, delta)
      options.project.syncDocument(nextDocument, delta)
    }
  }
}
