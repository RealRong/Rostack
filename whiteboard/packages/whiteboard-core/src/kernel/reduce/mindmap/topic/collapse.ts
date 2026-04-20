import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
import { getMindmap } from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapTopicCollapseApi = (
  tx: ReducerTx
) => ({
  set: (
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    collapsed?: boolean
  ) => {
    const current = getMindmap(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    const member = current.members[topicId]
    if (!member) {
      throw new Error(`Topic ${topicId} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'mindmap.topic.collapse',
      id,
      topicId,
      collapsed: member.collapsed
    })
    tx._runtime.draft.mindmaps.set(id, {
      ...current,
      members: {
        ...current.members,
        [topicId]: {
          ...member,
          collapsed: collapsed ?? !member.collapsed
        }
      }
    })
    markChange(tx._runtime.changes.mindmaps, 'update', id)
    tx.dirty.mindmap.layout(id)
  }
})
