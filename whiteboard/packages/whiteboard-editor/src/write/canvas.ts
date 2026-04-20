import type { Engine } from '@whiteboard/engine'
import type { CanvasWrite } from '@whiteboard/editor/write/types'

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
    move: (refs, mode) => engine.execute({
      type: 'canvas.order.move',
      refs,
      mode
    })
  }
})
