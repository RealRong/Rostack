import { isPointEdgeEnd } from '@whiteboard/core/edge/guards'
import type {
  Edge,
  EdgeId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { EdgeHandle } from '@whiteboard/core/types/edge'

export type EdgeCapability = {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
  editLabel: boolean
}

export type EdgeRoutePoint = {
  key: string
  kind: 'anchor' | 'insert' | 'control'
  edgeId: EdgeId
  point: Point
  active: boolean
  deletable: boolean
  pick:
    | {
        kind: 'anchor'
        index: number
      }
    | {
        kind: 'segment'
        insertIndex: number
        segmentIndex: number
        axis: 'x' | 'y'
      }
}

export type EdgeBox = {
  rect: Rect
  pad: number
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

export const readEdgeRoutePoints = (input: {
  edgeId: EdgeId
  edge: Edge
  handles: readonly EdgeHandle[]
  activeRouteIndex?: number
}): readonly EdgeRoutePoint[] => {
  const isStepManual =
    (input.edge.type === 'elbow' || input.edge.type === 'fillet')
    && input.edge.route?.kind === 'manual'

  return input.handles.flatMap<EdgeRoutePoint>((handle) => {
    if (handle.kind === 'anchor') {
      if (isStepManual) {
        return []
      }

      return [{
        key: `${input.edgeId}:anchor:${handle.index}`,
        kind: 'anchor',
        edgeId: input.edgeId,
        point: handle.point,
        active: input.activeRouteIndex === handle.index,
        deletable: true,
        pick: {
          kind: 'anchor',
          index: handle.index
        }
      }]
    }

    if (handle.kind === 'segment') {
      return [{
        key: `${input.edgeId}:${handle.role}:${handle.segmentIndex}`,
        kind: handle.role,
        edgeId: input.edgeId,
        point: handle.point,
        active: input.activeRouteIndex === handle.insertIndex,
        deletable: false,
        pick: {
          kind: 'segment',
          insertIndex: handle.insertIndex,
          segmentIndex: handle.segmentIndex,
          axis: handle.axis
        }
      }]
    }

    return []
  })
}

export const readEdgeBox = (input: {
  rect?: Rect
  edge?: Edge
}): EdgeBox | undefined => {
  if (!input.rect || !input.edge) {
    return undefined
  }

  return {
    rect: {
      ...input.rect
    },
    pad: Math.max(24, (input.edge.style?.width ?? 2) + 16)
  }
}
