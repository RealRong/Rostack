import type { GroupHistoryState } from '@/engine/history'
import type { GroupDocument } from '@/core/contracts'
import { cloneGroupDocument } from '@/core/document'
import { applyOperations } from '@/core/operation'
import type { ResolvedWriteBatch } from '@/engine/command'
import type { GroupCommitResult, GroupCreatedEntities, GroupCommandResult } from '../../types'
import type { GroupRead } from '../read/read'
import type { GroupHistoryReplay } from './history'
import { historyStacks } from './history'

interface CommitDocumentStore {
  peekDocument: () => GroupDocument
  installDocument: (document: GroupDocument) => GroupDocument
}

export interface CommitRuntimeOptions {
  document: CommitDocumentStore
  read: Pick<GroupRead, 'clear' | 'syncDocument'>
  historyCapacity: number
}

export interface GroupCommitRuntime {
  history: {
    state: () => GroupHistoryState
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
    undo: () => GroupCommitResult
    redo: () => GroupCommitResult
  }
  dispatch: (writeBatch: ResolvedWriteBatch) => GroupCommandResult
  replace: (document: GroupDocument) => void
}

const createdFromChanges = (changes?: GroupCommitResult['changes']): GroupCreatedEntities | undefined => {
  if (!changes) {
    return undefined
  }

  const created: GroupCreatedEntities = {
    records: changes.records?.added,
    properties: changes.properties?.added,
    views: changes.views?.added
  }

  return created.records?.length || created.properties?.length || created.views?.length
    ? created
    : undefined
}

export const commitRuntime = (options: CommitRuntimeOptions): GroupCommitRuntime => {
  const store = options.document
  const history = historyStacks({
    capacity: options.historyCapacity
  })
  const finalize = <TResult extends GroupCommitResult>(result: TResult, shouldSyncDocument: boolean): TResult => {
    if (shouldSyncDocument) {
      options.read.syncDocument(store.peekDocument(), result.changes)
    }
    return result
  }

  const dispatch = (writeBatch: ResolvedWriteBatch): GroupCommandResult => {
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
    const applied = applyOperations(beforeDocument, writeBatch.operations)
    const { undo, redo, document: afterDocument, changeSet } = applied
    store.installDocument(afterDocument)

    history.clearRedo()
    if (options.historyCapacity > 0) {
      history.pushUndo({ undo, redo })
    }

    return finalize(
      {
        issues: writeBatch.issues,
        applied: true,
        changes: changeSet,
        created: createdFromChanges(changeSet)
      },
      true
    )
  }

  const replay = (replay?: GroupHistoryReplay): GroupCommitResult => {
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

    const { document: afterDocument, changeSet } = applyOperations(beforeDocument, entry.operations)
    store.installDocument(afterDocument)

    return finalize(
      {
        issues: [],
        applied: true,
        changes: changeSet
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
      const nextDocument = cloneGroupDocument(document)

      history.clear()
      options.read.clear()
      store.installDocument(nextDocument)
      options.read.syncDocument(nextDocument)
    }
  }
}
