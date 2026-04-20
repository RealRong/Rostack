import { ok } from '@whiteboard/core/result'
import type {
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'
import {
  cloneBackground
} from '@whiteboard/core/kernel/reduce/clone'
import {
  materializeDraftDocument,
  readCanvasOrder,
  sameCanvasRef,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/draft'
import {
  createChangeSet,
  createInvalidation,
  RESET_READ_IMPACT
} from '@whiteboard/core/kernel/reduce/state'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'

type DocumentOperation = Extract<
  Operation,
  { type: 'document.replace' | 'document.background' | 'canvas.order.move' }
>

export const handleDocumentOperation = (
  runtime: ReduceRuntime,
  operation: DocumentOperation
): KernelReduceResult | undefined => {
  switch (operation.type) {
    case 'document.replace': {
      runtime.inverse.unshift({
        type: 'document.replace',
        document: materializeDraftDocument(runtime.draft)
      })
      return ok({
        doc: operation.document,
        changes: {
          ...createChangeSet(),
          document: true,
          background: true,
          canvasOrder: true
        },
        invalidation: {
          ...createInvalidation(),
          document: true,
          background: true,
          canvasOrder: true
        },
        inverse: runtime.inverse,
        impact: RESET_READ_IMPACT
      })
    }
    case 'document.background': {
      runtime.inverse.unshift({
        type: 'document.background',
        background: cloneBackground(runtime.draft.background)
      })
      runtime.draft.background = operation.background
      runtime.changes.background = true
      runtime.changes.document = true
      return
    }
    case 'canvas.order.move': {
      const currentOrder = [...readCanvasOrder(runtime.draft)]
      const refs = operation.refs.filter((ref) => (
        currentOrder.some((entry) => sameCanvasRef(entry, ref))
      ))
      if (refs.length === 0) {
        return
      }

      const previousIndex = currentOrder.findIndex((entry) => sameCanvasRef(entry, refs[0]!))
      const previousTo: Extract<Operation, { type: 'canvas.order.move' }>['to'] = previousIndex <= 0
        ? { kind: 'front' }
        : {
            kind: 'after',
            ref: currentOrder[previousIndex - 1]!
          }

      const filtered = currentOrder.filter((entry) => !refs.some((ref) => sameCanvasRef(ref, entry)))
      const insertAt = operation.to.kind === 'front'
        ? 0
        : operation.to.kind === 'back'
          ? filtered.length
          : (() => {
              const anchorIndex = filtered.findIndex((entry) => (
                operation.to.kind === 'before' || operation.to.kind === 'after'
                  ? sameCanvasRef(entry, operation.to.ref)
                  : false
              ))
              if (anchorIndex < 0) {
                return operation.to.kind === 'before'
                  ? 0
                  : filtered.length
              }
              return operation.to.kind === 'before'
                ? anchorIndex
                : anchorIndex + 1
            })()

      filtered.splice(insertAt, 0, ...refs)
      runtime.inverse.unshift({
        type: 'canvas.order.move',
        refs: [...refs],
        to: previousTo
      })
      writeCanvasOrder(runtime.draft, filtered)
      runtime.changes.canvasOrder = true
      return
    }
  }
}
