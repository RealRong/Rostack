import { changeSet, json } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getNode } from '@whiteboard/core/kernel/reduce/runtime'

const setTopicField = <Field extends import('@whiteboard/core/types').MindmapTopicField>(
  node: import('@whiteboard/core/types').Node,
  field: Field,
  value: import('@whiteboard/core/types').Node[Field]
): import('@whiteboard/core/types').Node => ({
  ...node,
  [field]: value
})

const unsetTopicField = (
  node: import('@whiteboard/core/types').Node,
  field: import('@whiteboard/core/types').MindmapTopicUnsetField
): import('@whiteboard/core/types').Node => {
  const next = { ...node } as import('@whiteboard/core/types').Node & Record<string, unknown>
  delete next[field]
  return next
}

export const createMindmapTopicFieldApi = (
  tx: ReducerTx
) => ({
  set: <Field extends import('@whiteboard/core/types').MindmapTopicField>(
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    field: Field,
    value: import('@whiteboard/core/types').Node[Field]
  ) => {
    const current = getNode(tx._runtime.draft, topicId)
    if (!current) {
      throw new Error(`Topic ${topicId} not found.`)
    }
    tx._runtime.inverse.unshift(
      (current as Record<string, unknown>)[field] === undefined && field !== 'size'
        ? {
            type: 'mindmap.topic.field.unset',
            id,
            topicId,
            field: field as import('@whiteboard/core/types').MindmapTopicUnsetField
          }
        : {
            type: 'mindmap.topic.field.set',
            id,
            topicId,
            field,
            value: json.clone((current as Record<string, unknown>)[field])
          }
    )
    tx._runtime.draft.nodes.set(topicId, setTopicField(current, field, value))
    changeSet.markUpdated(tx._runtime.changes.nodes, topicId)
    tx.dirty.node.touch(topicId)
    tx.dirty.mindmap.layout(id)
  },
  unset: (
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    field: import('@whiteboard/core/types').MindmapTopicUnsetField
  ) => {
    const current = getNode(tx._runtime.draft, topicId)
    if (!current) {
      throw new Error(`Topic ${topicId} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'mindmap.topic.field.set',
      id,
      topicId,
      field,
      value: json.clone((current as Record<string, unknown>)[field])
    })
    tx._runtime.draft.nodes.set(topicId, unsetTopicField(current, field))
    changeSet.markUpdated(tx._runtime.changes.nodes, topicId)
    tx.dirty.node.touch(topicId)
    tx.dirty.mindmap.layout(id)
  }
})
