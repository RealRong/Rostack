import type { Operation } from '@whiteboard/core/types'
import type { WhiteboardReduceCtx } from '@whiteboard/core/reducer/types'

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

export const reduceMindmapOperation = (
  ctx: WhiteboardReduceCtx,
  operation: MindmapOperation
) => {
  switch (operation.type) {
    case 'mindmap.create':
      ctx.mindmap.create({
        mindmap: operation.mindmap,
        nodes: operation.nodes
      })
      return
    case 'mindmap.restore':
      ctx.mindmap.restore(operation.snapshot)
      return
    case 'mindmap.delete':
      ctx.mindmap.delete(operation.id)
      return
    case 'mindmap.move':
      ctx.mindmap.moveRoot(operation.id, operation.position)
      return
    case 'mindmap.layout':
      ctx.mindmap.patchLayout(operation.id, operation.patch)
      return
    case 'mindmap.topic.insert':
      ctx.mindmap.insertTopic({
        id: operation.id,
        topic: operation.node,
        value: operation.input
      })
      return
    case 'mindmap.topic.restore':
      ctx.mindmap.restoreTopic({
        id: operation.id,
        snapshot: operation.snapshot
      })
      return
    case 'mindmap.topic.move':
      ctx.mindmap.moveTopic({
        id: operation.id,
        value: operation.input
      })
      return
    case 'mindmap.topic.delete':
      ctx.mindmap.deleteTopic({
        id: operation.id,
        nodeId: operation.input.nodeId
      })
      return
    case 'mindmap.topic.field.set':
      ctx.mindmap.setTopicField(operation.id, operation.topicId, operation.field, operation.value as never)
      return
    case 'mindmap.topic.field.unset':
      ctx.mindmap.unsetTopicField(operation.id, operation.topicId, operation.field)
      return
    case 'mindmap.topic.record.set':
      ctx.mindmap.setTopicRecord(operation.id, operation.topicId, operation.scope, operation.path, operation.value)
      return
    case 'mindmap.topic.record.unset':
      ctx.mindmap.unsetTopicRecord(operation.id, operation.topicId, operation.scope, operation.path)
      return
    case 'mindmap.branch.field.set':
      ctx.mindmap.setBranchField(operation.id, operation.topicId, operation.field, operation.value as never)
      return
    case 'mindmap.branch.field.unset':
      ctx.mindmap.unsetBranchField(operation.id, operation.topicId, operation.field)
      return
    case 'mindmap.topic.collapse':
      ctx.mindmap.setTopicCollapsed(operation.id, operation.topicId, operation.collapsed)
  }
}
