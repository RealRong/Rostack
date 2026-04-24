import {
  createCanvasOrderMoveOps,
  reorderCanvasRefs
} from '@whiteboard/core/canvas/ops'

export const canvas = {
  op: {
    orderMove: createCanvasOrderMoveOps,
    reorder: reorderCanvasRefs
  }
} as const
