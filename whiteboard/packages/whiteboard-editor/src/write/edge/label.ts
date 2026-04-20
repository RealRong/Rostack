import type { Engine } from '@whiteboard/engine'
import type { EdgeLabelWrite } from '@whiteboard/editor/write/types'

export const createEdgeLabelWrite = (
  engine: Engine
): EdgeLabelWrite => ({
  insert: (edgeId, label, to) => engine.execute({
    type: 'edge.label.insert',
    edgeId,
    label: label ?? {},
    to
  }),
  update: (edgeId, labelId, input) => engine.execute({
    type: 'edge.label.update',
    edgeId,
    labelId,
    input
  }),
  move: (edgeId, labelId, to) => engine.execute({
    type: 'edge.label.move',
    edgeId,
    labelId,
    to
  }),
  delete: (edgeId, labelId) => engine.execute({
    type: 'edge.label.delete',
    edgeId,
    labelId
  })
})
