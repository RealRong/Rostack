import type { EdgeBatchUpdate, EdgeCommand } from '@whiteboard/engine/types/command'
import {
  getEdge,
  getNode
} from '@whiteboard/core/document'
import {
  buildEdgeCreateOperation,
  clearRoute,
  getNearestEdgeInsertIndex,
  insertRoutePoint,
  isNodeEdgeEnd,
  moveEdge,
  moveRoutePoint,
  removeRoutePoint,
  resolveEdgePathFromRects
} from '@whiteboard/core/edge'
import { getNodeGeometry, getNodeRect } from '@whiteboard/core/node'
import { err, ok } from '@whiteboard/core/result'
import type { Edge, EdgeId, Node, SpatialNode } from '@whiteboard/core/types'
import type { WriteTranslateContext } from '@whiteboard/engine/write/translate'
import type { Step } from '@whiteboard/engine/write/translate/plan/shared'

type Create = Extract<EdgeCommand, { type: 'edge.create' }>
type Move = Extract<EdgeCommand, { type: 'edge.move' }>
type Reconnect = Extract<EdgeCommand, { type: 'edge.reconnect' }>
type Patch = Extract<EdgeCommand, { type: 'edge.patch' }>
type UpdateMany = Reconnect | Patch
type Remove = Extract<EdgeCommand, { type: 'edge.delete' }>
type Route = Extract<EdgeCommand, { type: `edge.route.${string}` }>
type RouteInsert = Extract<Route, { type: 'edge.route.insert' }>
type RouteRest = Exclude<Route, RouteInsert>

const asSpatial = (
  node: Node | undefined
): SpatialNode | undefined => node

const mergePatches = (updates: readonly EdgeBatchUpdate[]) => {
  const patchById = new Map<EdgeId, EdgeBatchUpdate['patch']>()

  updates.forEach(({ id, patch }) => {
    if (!Object.keys(patch).length) {
      return
    }

    const prev = patchById.get(id)
    patchById.set(id, prev ? { ...prev, ...patch } : patch)
  })

  return Array.from(patchById.entries()).map(([id, patch]) => ({
    type: 'edge.update' as const,
    id,
    patch
  }))
}

const pathOf = (
  edge: Edge,
  ctx: WriteTranslateContext
) => {
  const source =
    isNodeEdgeEnd(edge.source)
      ? asSpatial(getNode(ctx.doc, edge.source.nodeId))
      : undefined
  const target =
    isNodeEdgeEnd(edge.target)
      ? asSpatial(getNode(ctx.doc, edge.target.nodeId))
      : undefined

  if (isNodeEdgeEnd(edge.source) && !source) {
    return undefined
  }
  if (isNodeEdgeEnd(edge.target) && !target) {
    return undefined
  }

  return resolveEdgePathFromRects({
    edge,
    source: source
      ? {
          node: source,
          geometry: getNodeGeometry(
            source,
            getNodeRect(source, ctx.config.nodeSize),
            source.rotation ?? 0
          )
        }
      : undefined,
    target: target
      ? {
          node: target,
          geometry: getNodeGeometry(
            target,
            getNodeRect(target, ctx.config.nodeSize),
            target.rotation ?? 0
          )
        }
      : undefined
  }).path
}

const routePatch = (
  edgeId: EdgeId,
  ctx: WriteTranslateContext,
  patchOf: (edge: Readonly<Edge>) => ReturnType<typeof clearRoute> | undefined
): Step => {
  const edge = getEdge(ctx.doc, edgeId)
  if (!edge) {
    return err('cancelled', 'Edge not found.')
  }

  const patch = patchOf(edge)
  if (!patch) {
    return err('cancelled', 'No route patch generated.')
  }

  return ok({
    operations: [{
      type: 'edge.update',
      id: edgeId,
      patch
    }],
    output: undefined
  })
}

export const create = (
  command: Create,
  ctx: WriteTranslateContext
): Step<{ edgeId: EdgeId }> => {
  const next = buildEdgeCreateOperation({
    payload: command.payload,
    doc: ctx.doc,
    registries: ctx.registries,
    createEdgeId: ctx.ids.edge
  })
  if (!next.ok) {
    return err(next.error.code, next.error.message, next.error.details)
  }

  return ok({
    operations: [next.data.operation],
    output: {
      edgeId: next.data.edgeId
    }
  })
}

export const move = (
  command: Move,
  ctx: WriteTranslateContext
): Step =>
  routePatch(command.edgeId, ctx, (edge) =>
    moveEdge(edge, command.delta)
  )

export const updateMany = (command: UpdateMany): Step => {
  const updates = command.type === 'edge.reconnect'
    ? [{
        id: command.edgeId,
        patch: command.end === 'source'
          ? { source: command.target }
          : { target: command.target }
      }]
    : command.updates
  const operations = mergePatches(updates)
  if (!operations.length) {
    return err('cancelled', 'No edge updates provided.')
  }

  return ok({
    operations,
    output: undefined
  })
}

export const remove = (command: Remove): Step => {
  const ids = Array.from(new Set(command.ids))
  if (!ids.length) {
    return err('cancelled', 'No edges selected.')
  }

  return ok({
    operations: ids.map((id) => ({ type: 'edge.delete' as const, id })),
    output: undefined
  })
}

export function route(
  command: RouteInsert,
  ctx: WriteTranslateContext
): Step<{ index: number }>
export function route(
  command: RouteRest,
  ctx: WriteTranslateContext
): Step
export function route(
  command: Route,
  ctx: WriteTranslateContext
): Step<{ index: number }> | Step {
  switch (command.type) {
    case 'edge.route.insert': {
      if (!command.point) {
        return err('invalid', 'Route point required.')
      }

      const edge = getEdge(ctx.doc, command.edgeId)
      if (!edge) {
        return err('cancelled', 'Edge not found.')
      }

      const path = pathOf(edge, ctx)
      if (!path || !path.points.length || !path.segments.length) {
        return err('cancelled', 'Edge path unavailable.')
      }

      const at = getNearestEdgeInsertIndex(command.point, path.segments)
      const next = insertRoutePoint(edge, at, command.point)
      if (!next.ok) {
        return err(next.error.code, next.error.message, next.error.details)
      }

      return ok({
        operations: [{
          type: 'edge.update',
          id: edge.id,
          patch: next.data.patch
        }],
        output: {
          index: next.data.index
        }
      })
    }
    case 'edge.route.move': {
      if (!command.point) {
        return err('invalid', 'Route index and point required.')
      }

      const moveIndex = command.index
      const movePoint = command.point
      return routePatch(command.edgeId, ctx, (edge) =>
        moveRoutePoint(edge, moveIndex, movePoint)
      )
    }
    case 'edge.route.remove': {
      const removeIndex = command.index
      return routePatch(command.edgeId, ctx, (edge) =>
        removeRoutePoint(edge, removeIndex)
      )
    }
    case 'edge.route.clear':
      return routePatch(command.edgeId, ctx, (edge) => clearRoute(edge))
    default:
      return err('invalid', 'Unsupported route mode.')
  }
}
