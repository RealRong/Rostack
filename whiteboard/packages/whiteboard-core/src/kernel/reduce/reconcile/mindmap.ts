import {
  getMindmap,
  getMindmapTreeFromDraft,
  relayoutMindmap
} from '@whiteboard/core/kernel/reduce/runtime'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getSubtreeIds } from '@whiteboard/core/mindmap'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'

export const enqueueMindmapLayout = (
  tx: ReducerTx,
  id: import('@whiteboard/core/types').MindmapId
) => {
  const key = `mindmap.layout:${id}`
  if (tx._runtime.reconcile.queued.has(key)) {
    return
  }
  tx._runtime.reconcile.queued.add(key)
  tx._runtime.reconcile.tasks.push({
    type: 'mindmap.layout',
    id
  })
}

export const runMindmapLayout = (
  tx: ReducerTx,
  id: import('@whiteboard/core/types').MindmapId
) => {
  relayoutMindmap(tx._runtime.draft, id)
  const record = getMindmap(tx._runtime.draft, id)
  if (!record) {
    return
  }
  const tree = getMindmapTreeFromDraft(tx._runtime.draft, id)
  if (!tree) {
    return
  }
  getSubtreeIds(tree, record.root).forEach((nodeId) => {
    markChange(tx._runtime.changes.nodes, 'update', nodeId)
    tx._runtime.dirty.nodes.add(nodeId)
  })
}
