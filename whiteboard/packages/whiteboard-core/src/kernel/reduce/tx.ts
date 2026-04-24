import type {
  Document
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import { createReadApi } from '@whiteboard/core/kernel/reduce/read'
import { createDocumentApi } from '@whiteboard/core/kernel/reduce/document'
import { createNodeApi } from '@whiteboard/core/kernel/reduce/node'
import { createEdgeApi } from '@whiteboard/core/kernel/reduce/edge'
import { createGroupApi } from '@whiteboard/core/kernel/reduce/group'
import { createCollectionApi } from '@whiteboard/core/kernel/reduce/collection'
import { createSnapshotApi } from '@whiteboard/core/kernel/reduce/snapshot'
import { createDirtyApi } from '@whiteboard/core/kernel/reduce/dirty'
import { createReconcileApi } from '@whiteboard/core/kernel/reduce/reconcile/index'
import { createMindmapApi } from '@whiteboard/core/kernel/reduce/mindmap'
import { createCommitApi } from '@whiteboard/core/kernel/reduce/commit'

export const createReducerTx = (
  document: Document
): ReducerTx => {
  const tx = {
    _runtime: createReduceRuntime(document)
  } as unknown as ReducerTx

  tx.read = createReadApi(tx)
  tx.document = createDocumentApi(tx)
  tx.node = createNodeApi(tx)
  tx.edge = createEdgeApi(tx)
  tx.group = createGroupApi(tx)
  tx.collection = createCollectionApi(tx)
  tx.snapshot = createSnapshotApi(tx)
  tx.dirty = createDirtyApi(tx)
  tx.reconcile = createReconcileApi(tx)
  tx.mindmap = createMindmapApi(tx)
  tx.inverse = {
    prepend: (op) => {
      tx._runtime.inverse.prepend(op)
    },
    prependMany: (ops) => {
      tx._runtime.inverse.prependMany(ops)
    },
    append: (op) => {
      tx._runtime.inverse.append(op)
    },
    appendMany: (ops) => {
      tx._runtime.inverse.appendMany(ops)
    },
    finish: () => tx._runtime.inverse.finish()
  }
  tx.commit = createCommitApi(tx)

  return tx
}
