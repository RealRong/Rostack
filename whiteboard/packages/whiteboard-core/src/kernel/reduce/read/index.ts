import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { createReadDocumentApi } from '@whiteboard/core/kernel/reduce/read/document'
import { createReadCanvasApi } from '@whiteboard/core/kernel/reduce/read/canvas'
import { createReadNodeApi } from '@whiteboard/core/kernel/reduce/read/node'
import { createReadEdgeApi } from '@whiteboard/core/kernel/reduce/read/edge'
import { createReadGroupApi } from '@whiteboard/core/kernel/reduce/read/group'
import { createReadMindmapApi } from '@whiteboard/core/kernel/reduce/read/mindmap'
import { createReadRecordApi } from '@whiteboard/core/kernel/reduce/read/record'

export const createReadApi = (
  tx: ReducerTx
) => ({
  document: createReadDocumentApi(tx),
  canvas: createReadCanvasApi(tx),
  node: createReadNodeApi(tx),
  edge: createReadEdgeApi(tx),
  group: createReadGroupApi(tx),
  mindmap: createReadMindmapApi(tx),
  record: createReadRecordApi()
})
