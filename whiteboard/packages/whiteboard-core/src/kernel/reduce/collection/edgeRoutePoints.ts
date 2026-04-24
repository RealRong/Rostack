import { changeSet, json } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getEdge } from '@whiteboard/core/kernel/reduce/runtime'

const getPoints = (
  tx: ReducerTx,
  edgeId: import('@whiteboard/core/types').EdgeId
) => {
  const route = getEdge(tx._runtime.draft, edgeId)?.route
  return route?.kind === 'manual'
    ? route.points
    : []
}

const findIndex = (
  points: readonly import('@whiteboard/core/types').EdgeRoutePoint[],
  pointId: string
) => points.findIndex((point: import('@whiteboard/core/types').EdgeRoutePoint) => point.id === pointId)

export const createEdgeRoutePointsCollectionApi = (
  tx: ReducerTx,
  edgeId: import('@whiteboard/core/types').EdgeId
) => ({
  read: {
    list: () => getPoints(tx, edgeId),
    has: (itemId: string) => findIndex(getPoints(tx, edgeId), itemId) >= 0,
    get: (itemId: string) => getPoints(tx, edgeId).find((point) => point.id === itemId)
  },
  structure: {
    insert: (item: import('@whiteboard/core/types').EdgeRoutePoint, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      if (!current) {
        throw new Error(`Edge ${edgeId} not found.`)
      }
      const points = current.route?.kind === 'manual' ? [...current.route.points] : []
      const insertAt = anchor.kind === 'start'
        ? 0
        : anchor.kind === 'end'
          ? points.length
          : (() => {
              const anchorIndex = points.findIndex((point) => point.id === anchor.itemId)
              if (anchorIndex < 0) {
                return anchor.kind === 'before' ? 0 : points.length
              }
              return anchor.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      points.splice(insertAt, 0, item)
      tx.inverse.prepend({
        type: 'edge.route.point.delete',
        edgeId,
        pointId: item.id
      })
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        route: {
          kind: 'manual',
          points
        }
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.touch(edgeId)
    },
    delete: (itemId: string) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const points = current?.route?.kind === 'manual' ? [...current.route.points] : []
      const index = findIndex(points, itemId)
      if (!current || index < 0) {
        return
      }
      const point = points[index]!
      tx.inverse.prepend({
        type: 'edge.route.point.insert',
        edgeId,
        point: json.clone(point),
        to: index === 0
          ? { kind: 'start' }
          : { kind: 'after', pointId: points[index - 1]!.id }
      })
      const nextPoints = points.filter((entry) => entry.id !== itemId)
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        route: nextPoints.length > 0
          ? { kind: 'manual', points: nextPoints }
          : { kind: 'auto' }
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.touch(edgeId)
    },
    move: (itemId: string, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const points = current?.route?.kind === 'manual' ? [...current.route.points] : []
      const index = findIndex(points, itemId)
      if (!current || index < 0) {
        return
      }
      const point = points[index]!
      const inverseTo: Extract<import('@whiteboard/core/types').Operation, { type: 'edge.route.point.move' }>['to'] = index === 0
        ? { kind: 'start' }
        : { kind: 'after', pointId: points[index - 1]!.id }
      points.splice(index, 1)
      const insertAt = anchor.kind === 'start'
        ? 0
        : anchor.kind === 'end'
          ? points.length
          : (() => {
              const anchorIndex = points.findIndex((entry) => entry.id === anchor.itemId)
              if (anchorIndex < 0) {
                return anchor.kind === 'before' ? 0 : points.length
              }
              return anchor.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      points.splice(insertAt, 0, point)
      tx.inverse.prepend({
        type: 'edge.route.point.move',
        edgeId,
        pointId: itemId,
        to: inverseTo
      })
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        route: { kind: 'manual', points }
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.touch(edgeId)
    }
  },
  field: {
    set: (pointId: string, field: import('@whiteboard/core/types').EdgeRoutePointField, value: number) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const points = current?.route?.kind === 'manual' ? [...current.route.points] : []
      const index = findIndex(points, pointId)
      if (!current || index < 0) {
        throw new Error(`Edge route point ${pointId} not found.`)
      }
      const point = points[index]!
      tx.inverse.prepend({
        type: 'edge.route.point.field.set',
        edgeId,
        pointId,
        field,
        value: point[field]
      })
      points[index] = {
        ...point,
        [field]: value
      }
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        route: { kind: 'manual', points }
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.touch(edgeId)
    }
  }
})
