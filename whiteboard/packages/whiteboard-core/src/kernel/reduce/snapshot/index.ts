import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createCanvasSnapshotApi } from '@whiteboard/core/kernel/reduce/snapshot/canvas'
import { createNodeSnapshotApi } from '@whiteboard/core/kernel/reduce/snapshot/node'
import { createEdgeSnapshotApi } from '@whiteboard/core/kernel/reduce/snapshot/edge'
import { createGroupSnapshotApi } from '@whiteboard/core/kernel/reduce/snapshot/group'
import { createMindmapSnapshotApi } from '@whiteboard/core/kernel/reduce/snapshot/mindmap'

export const createSnapshotApi = (
  tx: ReducerTx
) => ({
  node: createNodeSnapshotApi(tx),
  edge: createEdgeSnapshotApi(tx),
  group: createGroupSnapshotApi(tx),
  mindmap: createMindmapSnapshotApi(tx),
  canvas: createCanvasSnapshotApi(tx)
})
