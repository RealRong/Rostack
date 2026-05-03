import { entityTable } from '@shared/core'
import type { Edge, EdgeInput, NodeId } from '@whiteboard/core/types'

const clonePoint = (point: { x: number; y: number }) => ({ x: point.x, y: point.y })

export const createEdgeDuplicateInput = (
  edge: Edge,
  sourceNodeId: NodeId,
  targetNodeId: NodeId
): EdgeInput => ({
  type: edge.type,
  locked: edge.locked,
  source: edge.source.kind === 'node'
    ? { ...edge.source, nodeId: sourceNodeId }
    : { ...edge.source, point: clonePoint(edge.source.point) },
  target: edge.target.kind === 'node'
    ? { ...edge.target, nodeId: targetNodeId }
    : { ...edge.target, point: clonePoint(edge.target.point) },
  points: edge.points
    ? entityTable.read.list(edge.points).map(clonePoint)
    : undefined,
  style: edge.style ? { ...edge.style } : undefined,
  textMode: edge.textMode,
  labels: edge.labels
    ? entityTable.normalize.list(entityTable.read.list(edge.labels).map((label) => ({
        id: label.id,
        text: label.text,
        t: label.t,
        offset: label.offset,
        style: label.style ? { ...label.style } : undefined
      })))
    : undefined,
  data: edge.data ? { ...edge.data } : undefined
})
