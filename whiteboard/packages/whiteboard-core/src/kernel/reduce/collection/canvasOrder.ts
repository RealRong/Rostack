import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import {
  canvasRefId,
  readCanvasOrder,
  removeCanvasRef,
  sameCanvasRef,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/runtime'

const fromId = (
  items: readonly import('@whiteboard/core/types').CanvasItemRef[],
  itemId: string
) => items.find((item) => canvasRefId(item) === itemId)

export const createCanvasOrderCollectionApi = (
  tx: ReducerTx
) => ({
  read: {
    list: () => readCanvasOrder(tx._runtime.draft),
    has: (itemId: string) => Boolean(fromId(readCanvasOrder(tx._runtime.draft), itemId)),
    get: (itemId: string) => fromId(readCanvasOrder(tx._runtime.draft), itemId)
  },
  structure: {
    insert: (item: import('@whiteboard/core/types').CanvasItemRef, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const filtered = removeCanvasRef(readCanvasOrder(tx._runtime.draft), item)
      const next = anchor.kind === 'start'
        ? [item, ...filtered]
        : anchor.kind === 'end'
          ? [...filtered, item]
          : (() => {
              const anchorItem = fromId(filtered, anchor.itemId)
              if (!anchorItem) {
                return anchor.kind === 'before'
                  ? [item, ...filtered]
                  : [...filtered, item]
              }
              const index = filtered.findIndex((entry) => sameCanvasRef(entry, anchorItem))
              return anchor.kind === 'before'
                ? [...filtered.slice(0, index), item, ...filtered.slice(index)]
                : [...filtered.slice(0, index + 1), item, ...filtered.slice(index + 1)]
            })()
      writeCanvasOrder(tx._runtime.draft, next)
      tx._runtime.changes.canvasOrder = true
      tx.dirty.canvas.order()
    },
    delete: (itemId: string) => {
      const item = fromId(readCanvasOrder(tx._runtime.draft), itemId)
      if (!item) {
        return
      }
      writeCanvasOrder(tx._runtime.draft, removeCanvasRef(readCanvasOrder(tx._runtime.draft), item))
      tx._runtime.changes.canvasOrder = true
      tx.dirty.canvas.order()
    },
    move: (itemId: string, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const item = fromId(readCanvasOrder(tx._runtime.draft), itemId)
      if (!item) {
        return
      }
      ;(createCanvasOrderCollectionApi(tx).structure.insert(item, anchor))
    },
    moveMany: (
      refs: readonly import('@whiteboard/core/types').CanvasItemRef[],
      to: { kind: 'front' | 'back' | 'before' | 'after'; ref?: import('@whiteboard/core/types').CanvasItemRef }
    ) => {
      const currentOrder = [...readCanvasOrder(tx._runtime.draft)]
      const existingRefs = refs.filter((ref) => currentOrder.some((entry) => sameCanvasRef(entry, ref)))
      if (existingRefs.length === 0) {
        return
      }
      const previousIndex = currentOrder.findIndex((entry) => sameCanvasRef(entry, existingRefs[0]!))
      const previousTo: Extract<import('@whiteboard/core/types').Operation, { type: 'canvas.order.move' }>['to'] = previousIndex <= 0
        ? { kind: 'front' }
        : {
            kind: 'after',
            ref: currentOrder[previousIndex - 1]!
          }

      const filtered = currentOrder.filter((entry) => !existingRefs.some((ref) => sameCanvasRef(ref, entry)))
      const insertAt = to.kind === 'front'
        ? 0
        : to.kind === 'back'
          ? filtered.length
          : (() => {
              const anchorIndex = filtered.findIndex((entry) => to.ref && sameCanvasRef(entry, to.ref))
              if (anchorIndex < 0) {
                return to.kind === 'before'
                  ? 0
                  : filtered.length
              }
              return to.kind === 'before'
                ? anchorIndex
                : anchorIndex + 1
            })()

      filtered.splice(insertAt, 0, ...existingRefs)
      tx._runtime.inverse.unshift({
        type: 'canvas.order.move',
        refs: [...existingRefs],
        to: previousTo
      })
      writeCanvasOrder(tx._runtime.draft, filtered)
      tx._runtime.changes.canvasOrder = true
      tx.dirty.canvas.order()
    }
  }
})
