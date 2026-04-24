import { createCanvasOrderMoveOps, reorderCanvasRefs } from '@whiteboard/core/canvas/ops'
import { document as documentApi } from '@whiteboard/core/document'
import type {
  Document,
  GroupId,
  Operation,
  OrderMode
} from '@whiteboard/core/types'

export const createGroupOrderMoveOps = (input: {
  document: Pick<Document, 'canvas' | 'nodes' | 'edges'>
  ids: readonly GroupId[]
  mode: OrderMode
}): readonly Operation[] => {
  const refs = input.ids.flatMap((groupId) =>
    documentApi.list.groupCanvasRefs(input.document, groupId)
  )
  const current = input.document.canvas.order
  const target = reorderCanvasRefs(current, refs, input.mode)
  return createCanvasOrderMoveOps(current, target)
}
