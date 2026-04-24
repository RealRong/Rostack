import { changeSet } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
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
    tx.inverse.prepend({
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
    changeSet.markUpdated(tx._runtime.changes.mindmaps, id)
    tx.dirty.mindmap.layout(id)
  }
})
