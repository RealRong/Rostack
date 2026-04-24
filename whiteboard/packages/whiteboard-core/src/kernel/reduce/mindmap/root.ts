import { changeSet } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { clonePoint } from '@whiteboard/core/kernel/reduce/copy'
import { getMindmap, getNode } from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapRootApi = (
  tx: ReducerTx
) => ({
  move: (
    id: import('@whiteboard/core/types').MindmapId,
    position: import('@whiteboard/core/types').Point
  ) => {
    const mindmap = getMindmap(tx._runtime.draft, id)
    const root = mindmap ? getNode(tx._runtime.draft, mindmap.root) : undefined
    if (!mindmap || !root) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'mindmap.move',
      id,
      position: clonePoint(root.position)!
    })
    tx._runtime.draft.nodes.set(root.id, {
      ...root,
      position: clonePoint(position)!
    })
    changeSet.markUpdated(tx._runtime.changes.nodes, root.id)
    tx.dirty.node.geometry(root.id)
    tx.dirty.mindmap.layout(id)
  }
})
