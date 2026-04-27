import { isPointEdgeEnd } from '@whiteboard/core/edge/guards'
import type {
  Edge,
  NodeId
} from '@whiteboard/core/types'

export type EdgeCapability = {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
  editLabel: boolean
}

const EDGE_CAPABILITY_BASE = {
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true,
  editLabel: true
} as const

export const resolveEdgeCapability = (input: {
  edge: Edge
  readNodeLocked: (nodeId: NodeId) => boolean
}): EdgeCapability => {
  const locked = Boolean(input.edge.locked)
  const relationLocked = [input.edge.source, input.edge.target].some((end) => (
    end.kind === 'node' && input.readNodeLocked(end.nodeId)
  ))
  const canEdit = !locked

  return {
    ...EDGE_CAPABILITY_BASE,
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit,
    editLabel: canEdit,
    move:
      canEdit
      && isPointEdgeEnd(input.edge.source)
      && isPointEdgeEnd(input.edge.target)
  }
}
