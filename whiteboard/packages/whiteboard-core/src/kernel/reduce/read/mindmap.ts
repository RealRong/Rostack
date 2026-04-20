import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import {
  getMindmap,
  getMindmapTreeFromDraft,
  getNode
} from '@whiteboard/core/kernel/reduce/runtime'

export const createReadMindmapApi = (
  tx: ReducerTx
) => ({
  get: (id: import('@whiteboard/core/types').MindmapId) => getMindmap(tx._runtime.draft, id),
  require: (id: import('@whiteboard/core/types').MindmapId) => {
    const mindmap = getMindmap(tx._runtime.draft, id)
    if (!mindmap) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    return mindmap
  },
  tree: (id: import('@whiteboard/core/types').MindmapId | import('@whiteboard/core/types').NodeId) =>
    getMindmapTreeFromDraft(tx._runtime.draft, id),
  topicRecord: (
    id: import('@whiteboard/core/types').MindmapId,
    topicId: import('@whiteboard/core/types').NodeId,
    scope: import('@whiteboard/core/types').MindmapTopicRecordScope
  ) => {
    const record = getMindmap(tx._runtime.draft, id)
    if (!record) {
      return undefined
    }
    const node = getNode(tx._runtime.draft, topicId)
    return scope === 'data'
      ? node?.data
      : node?.style
  }
})
