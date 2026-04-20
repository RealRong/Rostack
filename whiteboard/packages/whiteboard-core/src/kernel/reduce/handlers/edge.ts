import type {
  EdgeLabelAnchor,
  EdgeRoutePointAnchor,
  Operation
} from '@whiteboard/core/types'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

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
) => (
  anchor.kind === 'start' || anchor.kind === 'end'
    ? anchor
    : anchor.kind === 'before'
      ? { kind: 'before' as const, itemId: 'labelId' in anchor ? anchor.labelId : anchor.pointId }
      : { kind: 'after' as const, itemId: 'labelId' in anchor ? anchor.labelId : anchor.pointId }
)

export const handleEdgeOperation = (
  tx: ReducerTx,
  operation: EdgeOperation
) => {
  switch (operation.type) {
    case 'edge.create':
      tx.edge.lifecycle.create(operation.edge)
      return
    case 'edge.restore':
      tx.edge.lifecycle.restore(operation.edge, operation.slot)
      return
    case 'edge.field.set':
      tx.edge.field.set(operation.id, operation.field, operation.value as never)
      return
    case 'edge.field.unset':
      tx.edge.field.unset(operation.id, operation.field)
      return
    case 'edge.record.set':
      tx.edge.record.set(operation.id, operation.scope, operation.path, operation.value)
      return
    case 'edge.record.unset':
      tx.edge.record.unset(operation.id, operation.scope, operation.path)
      return
    case 'edge.label.insert':
      tx.collection.edge.labels(operation.edgeId).structure.insert(operation.label, toOrderedAnchor(operation.to))
      return
    case 'edge.label.delete':
      tx.collection.edge.labels(operation.edgeId).structure.delete(operation.labelId)
      return
    case 'edge.label.move':
      tx.collection.edge.labels(operation.edgeId).structure.move(operation.labelId, toOrderedAnchor(operation.to))
      return
    case 'edge.label.field.set':
      tx.collection.edge.labels(operation.edgeId).field.set(operation.labelId, operation.field, operation.value)
      return
    case 'edge.label.field.unset':
      tx.collection.edge.labels(operation.edgeId).field.unset(operation.labelId, operation.field)
      return
    case 'edge.label.record.set':
      tx.collection.edge.labels(operation.edgeId).record.set(operation.labelId, operation.scope, operation.path, operation.value)
      return
    case 'edge.label.record.unset':
      tx.collection.edge.labels(operation.edgeId).record.unset(operation.labelId, operation.scope, operation.path)
      return
    case 'edge.route.point.insert':
      tx.collection.edge.routePoints(operation.edgeId).structure.insert(operation.point, toOrderedAnchor(operation.to))
      return
    case 'edge.route.point.delete':
      tx.collection.edge.routePoints(operation.edgeId).structure.delete(operation.pointId)
      return
    case 'edge.route.point.move':
      tx.collection.edge.routePoints(operation.edgeId).structure.move(operation.pointId, toOrderedAnchor(operation.to))
      return
    case 'edge.route.point.field.set':
      tx.collection.edge.routePoints(operation.edgeId).field.set(operation.pointId, operation.field, operation.value)
      return
    case 'edge.delete':
      tx.edge.lifecycle.delete(operation.id)
  }
}
