import { changeSet, json } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getMindmap } from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapBranchFieldApi = (
  tx: ReducerTx
) => ({
  set: <Field extends import('@whiteboard/core/types').MindmapBranchField>(
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    field: Field,
    value: unknown
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
      type: 'mindmap.branch.field.set',
      id,
      topicId,
      field,
      value: json.clone(member.branchStyle[field])
    })
    tx._runtime.draft.mindmaps.set(id, {
      ...current,
      members: {
        ...current.members,
        [topicId]: {
          ...member,
          branchStyle: {
            ...member.branchStyle,
            [field]: json.clone(value) as never
          }
        }
      }
    })
    changeSet.markUpdated(tx._runtime.changes.mindmaps, id)
    tx.dirty.mindmap.layout(id)
  },
  unset: (
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    field: import('@whiteboard/core/types').MindmapBranchField
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
      type: 'mindmap.branch.field.set',
      id,
      topicId,
      field,
      value: json.clone(member.branchStyle[field])
    })
    tx._runtime.draft.mindmaps.set(id, {
      ...current,
      members: {
        ...current.members,
        [topicId]: {
          ...member,
          branchStyle: {
            ...member.branchStyle,
            [field]: undefined
          }
        }
      }
    })
    changeSet.markUpdated(tx._runtime.changes.mindmaps, id)
    tx.dirty.mindmap.layout(id)
  }
})
