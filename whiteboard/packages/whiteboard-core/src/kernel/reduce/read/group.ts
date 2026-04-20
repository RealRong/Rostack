import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

export const createReadGroupApi = (
  tx: ReducerTx
) => ({
  get: (id: import('@whiteboard/core/types').GroupId) => tx._runtime.draft.groups.get(id),
  require: (id: import('@whiteboard/core/types').GroupId) => {
    const group = tx._runtime.draft.groups.get(id)
    if (!group) {
      throw new Error(`Group ${id} not found.`)
    }
    return group
  }
})
