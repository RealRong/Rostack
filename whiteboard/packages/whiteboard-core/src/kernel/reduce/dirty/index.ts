import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createDirtyDocumentApi } from '@whiteboard/core/kernel/reduce/dirty/document'
import { createDirtyCanvasApi } from '@whiteboard/core/kernel/reduce/dirty/canvas'
import { createDirtyNodeApi } from '@whiteboard/core/kernel/reduce/dirty/node'
import { createDirtyEdgeApi } from '@whiteboard/core/kernel/reduce/dirty/edge'
import { createDirtyMindmapApi } from '@whiteboard/core/kernel/reduce/dirty/mindmap'
import { createDirtyProjectionApi } from '@whiteboard/core/kernel/reduce/dirty/projection'

export const createDirtyApi = (
  tx: ReducerTx
) => ({
  document: createDirtyDocumentApi(tx),
  canvas: createDirtyCanvasApi(tx),
  node: createDirtyNodeApi(tx),
  edge: createDirtyEdgeApi(tx),
  group: {
    value: (id: import('@whiteboard/core/types').GroupId) => {
      tx._runtime.dirty.groups.add(id)
    }
  },
  mindmap: createDirtyMindmapApi(tx),
  projection: createDirtyProjectionApi()
})
