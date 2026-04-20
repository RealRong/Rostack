import type {
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { handleDocumentOperation } from '@whiteboard/core/kernel/reduce/handlers/document'
import { handleNodeOperation } from '@whiteboard/core/kernel/reduce/handlers/node'
import { handleEdgeOperation } from '@whiteboard/core/kernel/reduce/handlers/edge'
import { handleGroupOperation } from '@whiteboard/core/kernel/reduce/handlers/group'
import { handleMindmapOperation } from '@whiteboard/core/kernel/reduce/handlers/mindmap'

export const dispatchOperation = (
  tx: ReducerTx,
  operation: Operation
) => {
  switch (operation.type) {
    case 'document.replace':
    case 'document.background':
    case 'canvas.order.move':
      handleDocumentOperation(tx, operation)
      return
    case 'node.create':
    case 'node.restore':
    case 'node.field.set':
    case 'node.field.unset':
    case 'node.record.set':
    case 'node.record.unset':
    case 'node.delete':
      handleNodeOperation(tx, operation)
      return
    case 'edge.create':
    case 'edge.restore':
    case 'edge.field.set':
    case 'edge.field.unset':
    case 'edge.record.set':
    case 'edge.record.unset':
    case 'edge.label.insert':
    case 'edge.label.delete':
    case 'edge.label.move':
    case 'edge.label.field.set':
    case 'edge.label.field.unset':
    case 'edge.label.record.set':
    case 'edge.label.record.unset':
    case 'edge.route.point.insert':
    case 'edge.route.point.delete':
    case 'edge.route.point.move':
    case 'edge.route.point.field.set':
    case 'edge.delete':
      handleEdgeOperation(tx, operation)
      return
    case 'group.create':
    case 'group.restore':
    case 'group.field.set':
    case 'group.field.unset':
    case 'group.delete':
      handleGroupOperation(tx, operation)
      return
    case 'mindmap.create':
    case 'mindmap.restore':
    case 'mindmap.delete':
    case 'mindmap.root.move':
    case 'mindmap.layout':
    case 'mindmap.topic.insert':
    case 'mindmap.topic.restore':
    case 'mindmap.topic.move':
    case 'mindmap.topic.delete':
    case 'mindmap.topic.field.set':
    case 'mindmap.topic.field.unset':
    case 'mindmap.topic.record.set':
    case 'mindmap.topic.record.unset':
    case 'mindmap.branch.field.set':
    case 'mindmap.branch.field.unset':
    case 'mindmap.topic.collapse':
      handleMindmapOperation(tx, operation)
  }
}
