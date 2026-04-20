import type {
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { handleDocumentOperation } from '@whiteboard/core/kernel/reduce/handlers/document'
import { handleNodeOperation } from '@whiteboard/core/kernel/reduce/handlers/node'
import { handleEdgeOperation } from '@whiteboard/core/kernel/reduce/handlers/edge'
import { handleGroupOperation } from '@whiteboard/core/kernel/reduce/handlers/group'
import { handleMindmapOperation } from '@whiteboard/core/kernel/reduce/handlers/mindmap'
import { meta } from '@whiteboard/core/spec/operation'

export const dispatchOperation = (
  tx: ReducerTx,
  operation: Operation
) => {
  switch (meta.get(operation.type).reducer) {
    case 'document':
      handleDocumentOperation(tx, operation as Parameters<typeof handleDocumentOperation>[1])
      return
    case 'node':
      handleNodeOperation(tx, operation as Parameters<typeof handleNodeOperation>[1])
      return
    case 'edge':
      handleEdgeOperation(tx, operation as Parameters<typeof handleEdgeOperation>[1])
      return
    case 'group':
      handleGroupOperation(tx, operation as Parameters<typeof handleGroupOperation>[1])
      return
    case 'mindmap':
      handleMindmapOperation(tx, operation as Parameters<typeof handleMindmapOperation>[1])
  }
}
