import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, EdgeId, NodeId, Rect } from '@whiteboard/core/types'
import type { EdgeHandle, ResolvedEdgeEnds } from '@whiteboard/core/types/edge'
import { equal } from '@shared/core'
import type { EditorInputState } from '@whiteboard/editor/session/interaction'

export type EdgeCapability = {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
  editLabel: boolean
}

export type EdgeBox = {
  rect: Rect
  pad: number
}

export type SelectedEdgeRoutePoint = {
  key: string
  kind: 'anchor' | 'insert' | 'control'
  edgeId: EdgeId
  point: EdgeHandle['point']
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

export type SelectedEdgeChrome = {
  edgeId: EdgeId
  ends: ResolvedEdgeEnds
  canReconnectSource: boolean
  canReconnectTarget: boolean
  canEditRoute: boolean
  showEditHandles: boolean
  routePoints: readonly SelectedEdgeRoutePoint[]
}

const EDGE_CAPABILITY_BASE = {
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true,
  editLabel: true
} as const

const isSelectedEdgeRoutePointEqual = (
  left: SelectedEdgeRoutePoint,
  right: SelectedEdgeRoutePoint
) => {
  if (left === right) {
    return true
  }

  if (
    left.key !== right.key
    || left.kind !== right.kind
    || left.edgeId !== right.edgeId
    || left.active !== right.active
    || left.deletable !== right.deletable
    || !geometryApi.equal.point(left.point, right.point)
    || left.pick.kind !== right.pick.kind
  ) {
    return false
  }

  if (left.pick.kind === 'anchor') {
    return right.pick.kind === 'anchor'
      && left.pick.index === right.pick.index
  }

  return right.pick.kind === 'segment'
    && left.pick.insertIndex === right.pick.insertIndex
    && left.pick.segmentIndex === right.pick.segmentIndex
    && left.pick.axis === right.pick.axis
}

export const isSelectedEdgeChromeEqual = (
  left: SelectedEdgeChrome | undefined,
  right: SelectedEdgeChrome | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.edgeId === right.edgeId
    && left.canReconnectSource === right.canReconnectSource
    && left.canReconnectTarget === right.canReconnectTarget
    && left.canEditRoute === right.canEditRoute
    && left.showEditHandles === right.showEditHandles
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
    && equal.sameOrder(
      left.routePoints,
      right.routePoints,
      isSelectedEdgeRoutePointEqual
    )
  )
)

export const readEdgeBox = (
  rect: Rect | undefined,
  edge: Edge | undefined
): EdgeBox | undefined => {
  if (!rect || !edge) {
    return undefined
  }

  return {
    rect,
    pad: Math.max(24, (edge.style?.width ?? 2) + 16)
  }
}

export const readSelectedEdgeId = (
  selection: SelectionTarget
): EdgeId | undefined => (
  selection.nodeIds.length === 0
  && selection.edgeIds.length === 1
    ? selection.edgeIds[0]
    : undefined
)

export const readSelectedEdgeRoutePoints = ({
  edgeId,
  edge,
  handles,
  activeRouteIndex
}: {
  edgeId: EdgeId
  edge: Edge
  handles: readonly EdgeHandle[]
  activeRouteIndex?: number
}): readonly SelectedEdgeRoutePoint[] => {
  const isStepManual =
    (edge.type === 'elbow' || edge.type === 'fillet')
    && edge.route?.kind === 'manual'

  return handles.flatMap<SelectedEdgeRoutePoint>((handle) => {
    if (handle.kind === 'anchor') {
      if (isStepManual) {
        return []
      }

      return [{
        key: `${edgeId}:anchor:${handle.index}`,
        kind: 'anchor',
        edgeId,
        point: handle.point,
        active: activeRouteIndex === handle.index,
        deletable: true,
        pick: {
          kind: 'anchor',
          index: handle.index
        }
      }]
    }

    if (handle.kind === 'segment') {
      return [{
        key: `${edgeId}:${handle.role}:${handle.segmentIndex}`,
        kind: handle.role,
        edgeId,
        point: handle.point,
        active: activeRouteIndex === handle.insertIndex,
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

export const isEdgeInteractionBlockingChrome = (
  mode: ReturnType<EditorInputState['mode']['get']>
) => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

export const resolveEdgeCapability = ({
  edge,
  readNodeLocked
}: {
  edge: Edge
  readNodeLocked: (nodeId: NodeId) => boolean
}): EdgeCapability => {
  const locked = Boolean(edge.locked)
  const relationLocked = [edge.source, edge.target].some((end) => (
    edgeApi.guard.isNodeEnd(end) && readNodeLocked(end.nodeId)
  ))
  const canEdit = !locked

  return {
    ...EDGE_CAPABILITY_BASE,
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit,
    editLabel: canEdit,
    move: canEdit && edgeApi.guard.isPointEnd(edge.source) && edgeApi.guard.isPointEnd(edge.target)
  }
}
