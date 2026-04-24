import { changeSet } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createGroupLifecycleApi = (
  tx: ReducerTx
) => ({
  create: (group: import('@whiteboard/core/types').Group) => {
    tx._runtime.draft.groups.set(group.id, group)
    tx._runtime.inverse.unshift({
      type: 'group.delete',
      id: group.id
    })
    changeSet.markAdded(tx._runtime.changes.groups, group.id)
    tx.dirty.group.value(group.id)
  },
  restore: (group: import('@whiteboard/core/types').Group) => {
    tx._runtime.draft.groups.set(group.id, group)
    tx._runtime.inverse.unshift({
      type: 'group.delete',
      id: group.id
    })
    changeSet.markAdded(tx._runtime.changes.groups, group.id)
    tx.dirty.group.value(group.id)
  },
  delete: (id: import('@whiteboard/core/types').GroupId) => {
    const current = tx._runtime.draft.groups.get(id)
    if (!current) {
      return
    }
    tx._runtime.inverse.unshift({
      type: 'group.restore',
      group: tx.snapshot.group.capture(id)
    })
    tx._runtime.draft.groups.delete(id)
    changeSet.markRemoved(tx._runtime.changes.groups, id)
    tx.dirty.group.value(id)
  }
})
