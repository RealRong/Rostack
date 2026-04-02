import type { EdgeWriteOutput, WriteCommandMap } from '@engine-types/command'
import type { TranslateResult } from '@engine-types/internal/translate'
import type { WriteTranslateContext } from './index'
import { cancelled, invalid, fromOp, success } from './result'
import {
  buildEdgeCreateOperation,
  getNearestEdgeInsertIndex,
  insertRoutePoint as insertRoutePointPatch,
  moveEdge as moveEdgePatch,
  moveRoutePoint as moveRoutePointPatch,
  removeRoutePoint as removeRoutePointPatch,
  clearRoute as clearRoutePatch,
  resolveEdgePathFromRects
} from '@whiteboard/core/edge'
import { getNodeRect } from '@whiteboard/core/geometry'
import {
  bringOrderForward,
  bringOrderToFront,
  sanitizeOrderIds,
  sendOrderBackward,
  sendOrderToBack
} from '@whiteboard/core/utils'
import {
  getEdge,
  getNode,
  isNodeEdgeEnd,
  type Document,
  type Edge,
  type EdgeId,
  type Node,
  type SpatialNode
} from '@whiteboard/core/types'

type EdgeCommand = WriteCommandMap['edge']
type UpdateManyCommand = Extract<EdgeCommand, { type: 'updateMany' }>
type OrderCommand = Extract<EdgeCommand, { type: 'order' }>

const readSpatialNode = (
  node: Node | undefined
): SpatialNode | undefined => (
  node && node.type !== 'group'
    ? node
    : undefined
)

const toUpdateOperations = (
  updates: readonly UpdateManyCommand['updates'][number][]
) => {
  const patchById = new Map<EdgeId, UpdateManyCommand['updates'][number]['patch']>()

  updates.forEach(({ id, patch }) => {
    if (!Object.keys(patch).length) return
    const previous = patchById.get(id)
    patchById.set(id, previous ? { ...previous, ...patch } : patch)
  })

  return Array.from(patchById.entries()).map(([id, patch]) => ({
    type: 'edge.update' as const,
    id,
    patch
  }))
}

const resolvePath = (
  doc: Document,
  edge: Edge,
  nodeSize: WriteTranslateContext['config']['nodeSize']
) => {
  const sourceNode =
    isNodeEdgeEnd(edge.source)
      ? readSpatialNode(getNode(doc, edge.source.nodeId))
      : undefined
  const targetNode =
    isNodeEdgeEnd(edge.target)
      ? readSpatialNode(getNode(doc, edge.target.nodeId))
      : undefined
  if (isNodeEdgeEnd(edge.source) && !sourceNode) return undefined
  if (isNodeEdgeEnd(edge.target) && !targetNode) return undefined

  return resolveEdgePathFromRects({
    edge,
    source: sourceNode
      ? {
          node: sourceNode,
          rect: getNodeRect(sourceNode, nodeSize),
          rotation: sourceNode.rotation
        }
      : undefined,
    target: targetNode
      ? {
          node: targetNode,
          rect: getNodeRect(targetNode, nodeSize),
          rotation: targetNode.rotation
        }
      : undefined
  }).path
}

export const translateEdge = <C extends EdgeCommand>(
  command: C,
  ctx: WriteTranslateContext
): TranslateResult<EdgeWriteOutput<C>> => {
  const doc = ctx.doc

  const updateMany = (command: UpdateManyCommand): TranslateResult => {
    const operations = toUpdateOperations(command.updates)
    if (!operations.length) {
      return cancelled('No edge updates provided.')
    }
    return success(operations)
  }

  const updateRoute = (
    edgeId: EdgeId,
    buildPatch: (edge: Readonly<Edge>) => ReturnType<typeof clearRoutePatch> | undefined
  ): TranslateResult => {
    const edge = getEdge(doc, edgeId)
    if (!edge) return cancelled('Edge not found.')
    const patch = buildPatch(edge)
    if (!patch) return cancelled('No route patch generated.')
    return success([{ type: 'edge.update', id: edgeId, patch }])
  }

  const order = (command: OrderCommand): TranslateResult => {
    const current = [...doc.edges.order]
    const target = sanitizeOrderIds(command.ids) as EdgeId[]
    let nextOrder: EdgeId[]
    switch (command.mode) {
      case 'set':
        nextOrder = target
        break
      case 'front':
        nextOrder = bringOrderToFront(current, target) as EdgeId[]
        break
      case 'back':
        nextOrder = sendOrderToBack(current, target) as EdgeId[]
        break
      case 'forward':
        nextOrder = bringOrderForward(current, target) as EdgeId[]
        break
      case 'backward':
        nextOrder = sendOrderBackward(current, target) as EdgeId[]
        break
      default:
        nextOrder = target
        break
    }
    return success([{ type: 'edge.order.set', ids: nextOrder }])
  }

  switch (command.type) {
    case 'create':
      return fromOp(
        buildEdgeCreateOperation({
          payload: command.payload,
          doc,
          registries: ctx.registries,
          createEdgeId: ctx.ids.edge
        }),
        ({ edgeId }) => ({ edgeId })
      ) as TranslateResult<EdgeWriteOutput<C>>
    case 'move':
      return updateRoute(command.edgeId, (edge) =>
        moveEdgePatch(edge, command.delta)
      ) as TranslateResult<EdgeWriteOutput<C>>
    case 'updateMany':
      return updateMany(command) as TranslateResult<EdgeWriteOutput<C>>
    case 'delete':
      return success(command.ids.map((id) => ({ type: 'edge.delete' as const, id }))) as TranslateResult<EdgeWriteOutput<C>>
    case 'order':
      return order(command) as TranslateResult<EdgeWriteOutput<C>>
    case 'route': {
      switch (command.mode) {
        case 'insert': {
          if (!command.point) return invalid('Route point required.')
          const edge = getEdge(doc, command.edgeId)
          if (!edge) return cancelled('Edge not found.')
          const path = resolvePath(doc, edge, ctx.config.nodeSize)
          if (!path || !path.points.length || !path.segments.length) {
            return cancelled('Edge path unavailable.')
          }
          const insertIndex = getNearestEdgeInsertIndex(command.point, path.segments)
          const patch = insertRoutePointPatch(
            edge,
            insertIndex,
            command.point
          )
          if (!patch.ok) return invalid(patch.error.message, patch.error.details)
          return success(
            [{ type: 'edge.update', id: edge.id, patch: patch.data.patch }],
            { index: patch.data.index }
          ) as TranslateResult<EdgeWriteOutput<C>>
        }
        case 'move':
          if (command.index === undefined || !command.point) {
            return invalid('Route index and point required.')
          }
          {
            const index = command.index
            const point = command.point
            return updateRoute(command.edgeId, (edge) =>
              moveRoutePointPatch(edge, index, point)
            ) as TranslateResult<EdgeWriteOutput<C>>
          }
        case 'remove':
          if (command.index === undefined) return invalid('Route index required.')
          {
            const index = command.index
            return updateRoute(command.edgeId, (edge) =>
              removeRoutePointPatch(edge, index)
            ) as TranslateResult<EdgeWriteOutput<C>>
          }
        case 'clear':
          return updateRoute(command.edgeId, (edge) => clearRoutePatch(edge)) as TranslateResult<EdgeWriteOutput<C>>
        default:
          return invalid('Unsupported route mode.') as TranslateResult<EdgeWriteOutput<C>>
      }
    }
    default:
      return invalid('Unsupported edge action.') as TranslateResult<EdgeWriteOutput<C>>
  }
}
