import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
import { getMindmap } from '@whiteboard/core/kernel/reduce/runtime'

const listChildren = (
  tx: ReducerTx,
  mindmapId: import('@whiteboard/core/types').MindmapId,
  parentId: import('@whiteboard/core/types').NodeId
) => getMindmap(tx._runtime.draft, mindmapId)?.children[parentId] ?? []

export const createMindmapChildrenCollectionApi = (
  tx: ReducerTx,
  mindmapId: import('@whiteboard/core/types').MindmapId,
  parentId: import('@whiteboard/core/types').NodeId
) => ({
  read: {
    list: () => listChildren(tx, mindmapId, parentId),
    has: (itemId: string) => listChildren(tx, mindmapId, parentId).includes(itemId),
    get: (itemId: string) => listChildren(tx, mindmapId, parentId).find((id) => id === itemId)
  },
  structure: {
    insert: (item: import('@whiteboard/core/types').NodeId, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const current = getMindmap(tx._runtime.draft, mindmapId)
      if (!current) {
        throw new Error(`Mindmap ${mindmapId} not found.`)
      }
      const children = [...(current.children[parentId] ?? []).filter((id) => id !== item)]
      const insertAt = anchor.kind === 'start'
        ? 0
        : anchor.kind === 'end'
          ? children.length
          : (() => {
              const anchorIndex = children.findIndex((id) => id === anchor.itemId)
              if (anchorIndex < 0) {
                return anchor.kind === 'before' ? 0 : children.length
              }
              return anchor.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      children.splice(insertAt, 0, item)
      tx._runtime.draft.mindmaps.set(mindmapId, {
        ...current,
        children: {
          ...current.children,
          [parentId]: children
        }
      })
      markChange(tx._runtime.changes.mindmaps, 'update', mindmapId)
      tx.dirty.mindmap.layout(mindmapId)
    },
    delete: (itemId: string) => {
      const current = getMindmap(tx._runtime.draft, mindmapId)
      if (!current) {
        throw new Error(`Mindmap ${mindmapId} not found.`)
      }
      tx._runtime.draft.mindmaps.set(mindmapId, {
        ...current,
        children: {
          ...current.children,
          [parentId]: (current.children[parentId] ?? []).filter((id) => id !== itemId)
        }
      })
      markChange(tx._runtime.changes.mindmaps, 'update', mindmapId)
      tx.dirty.mindmap.layout(mindmapId)
    },
    move: (itemId: string, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      createMindmapChildrenCollectionApi(tx, mindmapId, parentId).structure.insert(itemId, anchor)
    }
  }
})
