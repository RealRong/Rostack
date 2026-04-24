import { mutationTx } from '@shared/core'
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
): ReducerTx => mutationTx.createMutationTx({
  runtime: createReduceRuntime(document),
  create: (tx: ReducerTx) => ({
    read: createReadApi(tx),
    document: createDocumentApi(tx),
    node: createNodeApi(tx),
    edge: createEdgeApi(tx),
    group: createGroupApi(tx),
    collection: createCollectionApi(tx),
    snapshot: createSnapshotApi(tx),
    dirty: createDirtyApi(tx),
    reconcile: createReconcileApi(tx),
    mindmap: createMindmapApi(tx),
    inverse: tx._runtime.inverse,
    commit: createCommitApi(tx)
  })
})
