import { createId, entityTable } from '@shared/core'
import { schema as schemaApi } from '@whiteboard/core/registry/schema'
import { err, ok } from '@whiteboard/core/utils/result'
import type {
  CoreRegistries,
  Document,
  Edge,
  EdgeId,
  EdgeInput,
  EdgeRoutePoint,
  EdgePatch,
  Point
} from '@whiteboard/core/types'
import type {
  CreateEdgeResult,
  InsertRoutePointResult
} from '@whiteboard/core/types/edge'
import { isNodeEdgeEnd, isPointEdgeEnd } from '@whiteboard/core/edge/guards'

type CreateEdgeOpInput = {
  payload: EdgeInput
  doc: Document
  registries: CoreRegistries
  createEdgeId: () => EdgeId
  createEdgeRoutePointId: () => string
}

const createPointsPatch = (
  points?: readonly EdgeRoutePoint[]
): EdgePatch => ({
  points: points && points.length > 0
    ? entityTable.normalize.list(points)
    : undefined
})

export const setRoutePoints = (
  edge: Edge,
  points?: readonly Point[]
): EdgePatch => {
  const currentPoints = edge.points
    ? entityTable.read.list(edge.points)
    : []

  return createPointsPatch(
    points?.map((point, index) => ({
      id: currentPoints[index]?.id ?? createId('edge_point'),
      x: point.x,
      y: point.y
    }))
  )
}

const validateEdgeEnd = (
  doc: Document,
  end: EdgeInput['source'] | undefined,
  label: 'Source' | 'Target'
) => {
  if (!end) {
    return err('invalid', `Missing ${label.toLowerCase()} edge end.`)
  }

  if (isNodeEdgeEnd(end) && !doc.nodes[end.nodeId]) {
    return err('invalid', `${label} node ${end.nodeId} not found.`)
  }

  return ok(undefined)
}

export const createEdgeOp = ({
  payload,
  doc,
  registries,
  createEdgeId,
  createEdgeRoutePointId
}: CreateEdgeOpInput): CreateEdgeResult => {
  if (!payload.source || !payload.target) {
    return err('invalid', 'Missing edge ends.')
  }
  if (!payload.type) {
    return err('invalid', 'Missing edge type.')
  }
  if (payload.id && doc.edges[payload.id]) {
    return err('invalid', `Edge ${payload.id} already exists.`)
  }

  const sourceValidation = validateEdgeEnd(doc, payload.source, 'Source')
  if (!sourceValidation.ok) {
    return sourceValidation
  }
  const targetValidation = validateEdgeEnd(doc, payload.target, 'Target')
  if (!targetValidation.ok) {
    return targetValidation
  }

  const typeDef = registries.edgeTypes.get(payload.type)
  if (typeDef?.validate && !typeDef.validate(payload.data)) {
    return err('invalid', `Edge ${payload.type} validation failed.`)
  }

  const missing = schemaApi.edge.missingFields(payload, registries)
  if (missing.length > 0) {
    return err('invalid', `Missing required fields: ${missing.join(', ')}.`)
  }

  const normalized = schemaApi.edge.applyDefaults(payload, registries)
  const id = normalized.id ?? createEdgeId()
  const points = normalized.points
    ? entityTable.normalize.list(normalized.points.map<EdgeRoutePoint>((point) => ({
        id: createEdgeRoutePointId(),
        x: point.x,
        y: point.y
      })))
    : undefined

  return ok({
    edgeId: id,
    edge: {
      ...normalized,
      id,
      type: normalized.type ?? 'straight',
      points
    }
  })
}

export const insertRoutePoint = (
  edge: Edge,
  insertIndex: number,
  pointWorld: Point
): InsertRoutePointResult => {
  const basePoints = edge.points
    ? entityTable.read.list(edge.points)
    : []
  const nextInsertIndex = Math.max(0, Math.min(insertIndex, basePoints.length))
  const nextPoints = [...basePoints]
  nextPoints.splice(nextInsertIndex, 0, {
    id: createId('edge_point'),
    x: pointWorld.x,
    y: pointWorld.y
  })
  return ok({
    index: nextInsertIndex,
    point: pointWorld,
    patch: createPointsPatch(nextPoints)
  })
}

export const moveRoutePoint = (
  edge: Edge,
  index: number,
  pointWorld: Point
): EdgePatch | undefined => {
  const points = edge.points
    ? entityTable.read.list(edge.points)
    : []
  if (index < 0 || index >= points.length) return undefined
  const nextPoints = points.map((point, idx) => (
    idx === index
      ? {
          ...point,
          x: pointWorld.x,
          y: pointWorld.y
        }
      : point
  ))
  return createPointsPatch(nextPoints)
}

export const removeRoutePoint = (
  edge: Edge,
  index: number
): EdgePatch | undefined => {
  const points = edge.points
    ? entityTable.read.list(edge.points)
    : []
  if (index < 0 || index >= points.length) return undefined

  const nextPoints = points.filter((_, idx) => idx !== index)
  return createPointsPatch(nextPoints)
}

export const clearRoute = (edge: Edge): EdgePatch =>
  createPointsPatch(undefined)

export const moveEdgeRoute = (
  edge: Edge,
  delta: Point
): EdgePatch | undefined => {
  if (delta.x === 0 && delta.y === 0) {
    return undefined
  }

  const routePoints = edge.points
    ? entityTable.read.list(edge.points).map((point) => ({
        ...point,
        x: point.x + delta.x,
        y: point.y + delta.y
      }))
    : undefined

  if (!routePoints?.length) {
    return undefined
  }

  return createPointsPatch(routePoints)
}

export const moveEdge = (
  edge: Edge,
  delta: Point
): EdgePatch | undefined => {
  if (delta.x === 0 && delta.y === 0) {
    return undefined
  }

  let changed = false

  const source = isPointEdgeEnd(edge.source)
    ? {
        ...edge.source,
        point: {
          x: edge.source.point.x + delta.x,
          y: edge.source.point.y + delta.y
        }
      }
    : edge.source
  if (source !== edge.source) {
    changed = true
  }

  const target = isPointEdgeEnd(edge.target)
    ? {
        ...edge.target,
        point: {
          x: edge.target.point.x + delta.x,
          y: edge.target.point.y + delta.y
        }
      }
    : edge.target
  if (target !== edge.target) {
    changed = true
  }

  const routePatch = moveEdgeRoute(edge, delta)
  if (routePatch) {
    changed = true
  }

  if (!changed) {
    return undefined
  }

  return {
    ...(source !== edge.source ? { source } : {}),
    ...(target !== edge.target ? { target } : {}),
    ...(routePatch ?? {})
  }
}
