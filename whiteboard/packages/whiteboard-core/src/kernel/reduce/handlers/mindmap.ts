import type {
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

type MindmapOperation = Extract<
  Operation,
  {
    type:
      | 'mindmap.create'
      | 'mindmap.restore'
      | 'mindmap.delete'
      | 'mindmap.move'
      | 'mindmap.layout'
      | 'mindmap.topic.insert'
      | 'mindmap.topic.restore'
      | 'mindmap.topic.move'
      | 'mindmap.topic.delete'
      | 'mindmap.topic.field.set'
      | 'mindmap.topic.field.unset'
      | 'mindmap.topic.record.set'
      | 'mindmap.topic.record.unset'
      | 'mindmap.branch.field.set'
      | 'mindmap.branch.field.unset'
      | 'mindmap.topic.collapse'
  }
>

export const handleMindmapOperation = (
  tx: ReducerTx,
  operation: MindmapOperation
) => {
  switch (operation.type) {
    case 'mindmap.create':
      tx.mindmap.structure.create({
        mindmap: operation.mindmap,
        nodes: operation.nodes
      })
      return
    case 'mindmap.restore':
      tx.mindmap.structure.restore(operation.snapshot)
      return
    case 'mindmap.delete':
      tx.mindmap.structure.delete(operation.id)
      return
    case 'mindmap.move':
      tx.mindmap.root.move(operation.id, operation.position)
      return
    case 'mindmap.layout':
      tx.mindmap.layout.patch(operation.id, operation.patch)
      return
    case 'mindmap.topic.insert':
      tx.mindmap.topic.structure.insert({
        id: operation.id,
        topic: operation.node,
        value: operation.input
      })
      return
    case 'mindmap.topic.restore':
      tx.mindmap.topic.structure.restore({
        id: operation.id,
        snapshot: operation.snapshot
      })
      return
    case 'mindmap.topic.move':
      tx.mindmap.topic.structure.move({
        id: operation.id,
        value: operation.input
      })
      return
    case 'mindmap.topic.delete':
      tx.mindmap.topic.structure.delete({
        id: operation.id,
        nodeId: operation.input.nodeId
      })
      return
    case 'mindmap.topic.field.set':
      tx.mindmap.topic.field.set(operation.id, operation.topicId, operation.field, operation.value as never)
      return
    case 'mindmap.topic.field.unset':
      tx.mindmap.topic.field.unset(operation.id, operation.topicId, operation.field)
      return
    case 'mindmap.topic.record.set':
      tx.mindmap.topic.record.set(operation.id, operation.topicId, operation.scope, operation.path, operation.value)
      return
    case 'mindmap.topic.record.unset':
      tx.mindmap.topic.record.unset(operation.id, operation.topicId, operation.scope, operation.path)
      return
    case 'mindmap.branch.field.set':
      tx.mindmap.branch.field.set(operation.id, operation.topicId, operation.field, operation.value)
      return
    case 'mindmap.branch.field.unset':
      tx.mindmap.branch.field.unset(operation.id, operation.topicId, operation.field)
      return
    case 'mindmap.topic.collapse':
      tx.mindmap.topic.collapse.set(operation.id, operation.topicId, operation.collapsed)
  }
}
