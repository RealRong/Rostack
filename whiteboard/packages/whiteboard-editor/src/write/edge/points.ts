import type { Engine } from '@whiteboard/engine'
import type { EdgePointsWrite } from '@whiteboard/editor/write/types'

export const createEdgePointsWrite = (
  engine: Engine
): EdgePointsWrite => ({
  insert: (edgeId, point, to) => engine.execute({
    type: 'edge.points.insert',
    edgeId,
    point,
    to
  }),
  set: (edgeId, points) => engine.execute({
    type: 'edge.points.set',
    edgeId,
    points
  }),
  update: (edgeId, pointId, fields) => engine.execute({
    type: 'edge.points.update',
    edgeId,
    pointId,
    fields
  }),
  move: (edgeId, pointId, to) => engine.execute({
    type: 'edge.points.move',
    edgeId,
    pointId,
    to
  }),
  delete: (edgeId, pointId) => engine.execute({
    type: 'edge.points.delete',
    edgeId,
    pointId
  }),
  clear: (edgeId) => engine.execute({
    type: 'edge.points.clear',
    edgeId
  })
})
