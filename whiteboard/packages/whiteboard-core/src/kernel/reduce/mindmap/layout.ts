import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneLayoutPatch } from '@whiteboard/core/kernel/reduce/copy'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
import { getMindmap } from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapLayoutApi = (
  tx: ReducerTx
) => ({
  patch: (
    id: import('@whiteboard/core/types').MindmapId,
    patch: Partial<import('@whiteboard/core/types').MindmapLayoutSpec>
  ) => {
    const current = getMindmap(tx._runtime.draft, id)
    if (!current) {
      throw new Error(`Mindmap ${id} not found.`)
    }
    tx._runtime.inverse.unshift({
      type: 'mindmap.layout',
      id,
      patch: cloneLayoutPatch(current.layout)!
    })
    tx._runtime.draft.mindmaps.set(id, {
      ...current,
      layout: {
        ...current.layout,
        ...patch
      }
    })
    markChange(tx._runtime.changes.mindmaps, 'update', id)
    tx.dirty.mindmap.layout(id)
  }
})
