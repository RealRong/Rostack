import type { Engine } from '@whiteboard/engine'
import type { EdgeRouteWrite } from '@whiteboard/editor/write/types'

export const createEdgeRouteWrite = (
  engine: Engine
): EdgeRouteWrite => ({
  insert: (edgeId, point, to) => engine.execute({
    type: 'edge.route.insert',
    edgeId,
    point,
    to
  }),
  set: (edgeId, route) => engine.execute({
    type: 'edge.route.set',
    edgeId,
    route
  }),
  update: (edgeId, pointId, fields) => engine.execute({
    type: 'edge.route.update',
    edgeId,
    pointId,
    fields
  }),
  move: (edgeId, pointId, to) => engine.execute({
    type: 'edge.route.move',
    edgeId,
    pointId,
    to
  }),
  delete: (edgeId, pointId) => engine.execute({
    type: 'edge.route.delete',
    edgeId,
    pointId
  }),
  clear: (edgeId) => engine.execute({
    type: 'edge.route.clear',
    edgeId
  })
})
