import type {
  ChangeSet,
  Document,
  Operation
} from '@whiteboard/core/types'
import {
  createDraftDocument,
  type DraftDocument
} from '@whiteboard/core/kernel/reduce/draft'
import { createChangeSet } from '@whiteboard/core/kernel/reduce/state'
import { createReconcileQueue, type ReconcileQueue } from '@whiteboard/core/kernel/reduce/reconcile'

export type ReduceRuntime = {
  draft: DraftDocument
  changes: ChangeSet
  inverse: Operation[]
  reconcile: ReconcileQueue
  queueMindmapLayout: (id: string) => void
}

export const createReduceRuntime = (
  document: Document
): ReduceRuntime => {
  const reconcile = createReconcileQueue()
  return {
    draft: createDraftDocument(document),
    changes: createChangeSet(),
    inverse: [],
    reconcile,
    queueMindmapLayout: (id: string) => {
      reconcile.enqueue({
        type: 'mindmap.layout',
        id
      })
    }
  }
}
