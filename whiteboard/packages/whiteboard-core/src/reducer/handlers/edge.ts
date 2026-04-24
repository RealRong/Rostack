import type {
  EdgeLabelAnchor,
  EdgeRoutePointAnchor,
  Operation
} from '@whiteboard/core/types'
import type {
  OrderedAnchor,
  WhiteboardReduceCtx
} from '@whiteboard/core/reducer/types'

type EdgeOperation = Extract<
  Operation,
  {
    type:
      | 'edge.create'
      | 'edge.restore'
      | 'edge.field.set'
      | 'edge.field.unset'
      | 'edge.record.set'
      | 'edge.record.unset'
      | 'edge.label.insert'
      | 'edge.label.delete'
      | 'edge.label.move'
      | 'edge.label.field.set'
      | 'edge.label.field.unset'
      | 'edge.label.record.set'
      | 'edge.label.record.unset'
      | 'edge.route.point.insert'
      | 'edge.route.point.delete'
      | 'edge.route.point.move'
      | 'edge.route.point.field.set'
      | 'edge.delete'
  }
>

const toOrderedAnchor = (
  anchor: EdgeLabelAnchor | EdgeRoutePointAnchor
): OrderedAnchor => (
  anchor.kind === 'start' || anchor.kind === 'end'
    ? anchor
    : anchor.kind === 'before'
      ? {
          kind: 'before',
          itemId: 'labelId' in anchor
            ? anchor.labelId
            : anchor.pointId
        }
      : {
          kind: 'after',
          itemId: 'labelId' in anchor
            ? anchor.labelId
            : anchor.pointId
        }
)

export const reduceEdgeOperation = (
  ctx: WhiteboardReduceCtx,
  operation: EdgeOperation
) => {
  switch (operation.type) {
    case 'edge.create':
      ctx.edge.create(operation.edge)
      return
    case 'edge.restore':
      ctx.edge.restore(operation.edge, operation.slot)
      return
    case 'edge.field.set':
      ctx.edge.setField(operation.id, operation.field, operation.value as never)
      return
    case 'edge.field.unset':
      ctx.edge.unsetField(operation.id, operation.field)
      return
    case 'edge.record.set':
      ctx.edge.setRecord(operation.id, operation.scope, operation.path, operation.value)
      return
    case 'edge.record.unset':
      ctx.edge.unsetRecord(operation.id, operation.scope, operation.path)
      return
    case 'edge.label.insert':
      ctx.edge.insertLabel(operation.edgeId, operation.label, toOrderedAnchor(operation.to))
      return
    case 'edge.label.delete':
      ctx.edge.deleteLabel(operation.edgeId, operation.labelId)
      return
    case 'edge.label.move':
      ctx.edge.moveLabel(operation.edgeId, operation.labelId, toOrderedAnchor(operation.to))
      return
    case 'edge.label.field.set':
      ctx.edge.setLabelField(operation.edgeId, operation.labelId, operation.field, operation.value)
      return
    case 'edge.label.field.unset':
      ctx.edge.unsetLabelField(operation.edgeId, operation.labelId, operation.field)
      return
    case 'edge.label.record.set':
      ctx.edge.setLabelRecord(operation.edgeId, operation.labelId, operation.scope, operation.path, operation.value)
      return
    case 'edge.label.record.unset':
      ctx.edge.unsetLabelRecord(operation.edgeId, operation.labelId, operation.scope, operation.path)
      return
    case 'edge.route.point.insert':
      ctx.edge.insertRoutePoint(operation.edgeId, operation.point, toOrderedAnchor(operation.to))
      return
    case 'edge.route.point.delete':
      ctx.edge.deleteRoutePoint(operation.edgeId, operation.pointId)
      return
    case 'edge.route.point.move':
      ctx.edge.moveRoutePoint(operation.edgeId, operation.pointId, toOrderedAnchor(operation.to))
      return
    case 'edge.route.point.field.set':
      ctx.edge.setRoutePointField(operation.edgeId, operation.pointId, operation.field, operation.value)
      return
    case 'edge.delete':
      ctx.edge.delete(operation.id)
  }
}
