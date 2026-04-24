import { changeSet, json, record } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getNode } from '@whiteboard/core/kernel/reduce/runtime'

const applyTopicRecordMutation = (
  node: import('@whiteboard/core/types').Node,
  scope: import('@whiteboard/core/types').MindmapTopicRecordScope,
  mutation: { op: 'set'; path: string; value: unknown } | { op: 'unset'; path: string }
) => {
  const current = scope === 'data'
    ? node.data
    : node.style
  const result = record.apply(current, mutation)
  if (!result.ok) {
    return result
  }
  return {
    ok: true as const,
    node: {
      ...node,
      ...(scope === 'data'
        ? { data: result.value as import('@whiteboard/core/types').Node['data'] }
        : { style: result.value as import('@whiteboard/core/types').Node['style'] })
    }
  }
}

export const createMindmapTopicRecordApi = (
  tx: ReducerTx
) => ({
  set: (
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').MindmapTopicRecordScope,
    path: string,
    value: unknown
  ) => {
    const current = getNode(tx._runtime.draft, topicId)
    if (!current) {
      throw new Error(`Topic ${topicId} not found.`)
    }
    const currentRoot = scope === 'data' ? current.data : current.style
    const previous = tx.read.record.path(currentRoot, path)
    tx.inverse.prepend(previous === undefined
      ? { type: 'mindmap.topic.record.unset', id, topicId, scope, path }
      : { type: 'mindmap.topic.record.set', id, topicId, scope, path, value: json.clone(previous) })
    const next = applyTopicRecordMutation(current, scope, {
      op: 'set',
      path,
      value
    })
    if (!next.ok) {
      throw new Error(next.message)
    }
    tx._runtime.draft.nodes.set(topicId, next.node)
    changeSet.markUpdated(tx._runtime.changes.nodes, topicId)
    tx.dirty.node.touch(topicId)
    tx.dirty.mindmap.layout(id)
  },
  unset: (
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').MindmapTopicRecordScope,
    path: string
  ) => {
    const current = getNode(tx._runtime.draft, topicId)
    if (!current) {
      throw new Error(`Topic ${topicId} not found.`)
    }
    const currentRoot = scope === 'data' ? current.data : current.style
    tx.inverse.prepend({
      type: 'mindmap.topic.record.set',
      id,
      topicId,
      scope,
      path,
      value: json.clone(tx.read.record.path(currentRoot, path))
    })
    const next = applyTopicRecordMutation(current, scope, {
      op: 'unset',
      path
    })
    if (!next.ok) {
      throw new Error(next.message)
    }
    tx._runtime.draft.nodes.set(topicId, next.node)
    changeSet.markUpdated(tx._runtime.changes.nodes, topicId)
    tx.dirty.node.touch(topicId)
    tx.dirty.mindmap.layout(id)
  }
})
