import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneGroup } from '@whiteboard/core/kernel/reduce/copy'

export const createGroupSnapshotApi = (
  tx: ReducerTx
) => ({
  capture: (id: import('@whiteboard/core/types').GroupId) => {
    const group = tx._runtime.draft.groups.get(id)
    if (!group) {
      throw new Error(`Group ${id} not found.`)
    }
    return cloneGroup(group)
  }
})
