import type { Engine } from '@whiteboard/engine'
import type { CanvasWrite } from '@whiteboard/editor/write/types'
import type { IntentResult } from '@whiteboard/engine/types/result'
import { planCanvasOrderStep } from '@whiteboard/editor/write/orderStep'

export const createCanvasWrite = (
  engine: Engine
): CanvasWrite => ({
  delete: (refs) => engine.execute({
    type: 'canvas.delete',
    refs
  }),
  duplicate: (refs) => engine.execute({
    type: 'canvas.duplicate',
    refs
  }),
  selection: {
    move: (input) => engine.execute({
      type: 'canvas.selection.move',
      ...input
    })
  },
  order: {
    move: (refs, to) => engine.execute({
      type: 'document.order.move',
      refs,
      to
    }),
    step: (refs, direction) => {
      const planned = planCanvasOrderStep({
        document: engine.doc(),
        refs,
        direction
      })
      return (planned.length > 0
        ? engine.execute(planned as any)
        : engine.execute({
            type: 'document.order.move',
            refs: [],
            to: {
              kind: 'front'
            }
          })) as IntentResult
    }
  }
})
