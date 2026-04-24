import { changeSet } from '@shared/core'
import {
  getMindmap,
  getMindmapTreeFromDraft,
  relayoutMindmap
} from '@whiteboard/core/kernel/reduce/runtime'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'

export const enqueueMindmapLayout = (
  tx: ReducerTx,
  id: import('@whiteboard/core/types').MindmapId
) => {
  const key = `mindmap.layout:${id}`
  if (tx._runtime.reconcile.queued.has(key)) {
    return
  }
  tx._runtime.reconcile.queued.add(key)
  tx._runtime.reconcile.tasks.emit({
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
  mindmapApi.tree.subtreeIds(tree, record.root).forEach((nodeId) => {
    changeSet.markUpdated(tx._runtime.changes.nodes, nodeId)
    tx.dirty.node.touch(nodeId)
  })
}
