import { equal } from '@shared/core'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { EdgeHandle } from '@whiteboard/core/types/edge'
import type { Edge, EdgeId, NodeId } from '@whiteboard/core/types'
import type { EdgeOverlayRoutePoint, EdgeOverlayView, EdgeStaticView } from '../../contracts/render'
import type { RenderContext } from './context'
import { reconcileValue } from '../reconcile'

const EMPTY_ENDPOINT_HANDLES: EdgeOverlayView['endpointHandles'] = []
const EMPTY_ROUTE_POINTS: readonly EdgeOverlayRoutePoint[] = []

const isStaticStyleEqual = (
  left: EdgeStaticView['style'],
  right: EdgeStaticView['style']
): boolean => (
  left.color === right.color
  && left.width === right.width
  && left.opacity === right.opacity
  && left.dash === right.dash
  && left.start === right.start
  && left.end === right.end
)

const isOverlayHandleEqual = (
  left: NonNullable<EdgeOverlayView['endpointHandles']>[number],
  right: NonNullable<EdgeOverlayView['endpointHandles']>[number]
): boolean => (
  left.edgeId === right.edgeId
  && left.end === right.end
  && geometryApi.equal.point(left.point, right.point)
)

const isOverlayRoutePointEqual = (
  left: EdgeOverlayRoutePoint,
  right: EdgeOverlayRoutePoint
): boolean => (
  left.key === right.key
  && left.kind === right.kind
  && left.edgeId === right.edgeId
  && left.active === right.active
  && left.deletable === right.deletable
  && geometryApi.equal.point(left.point, right.point)
  && left.pick.kind === right.pick.kind
  && (
    left.pick.kind === 'anchor'
      ? (
          right.pick.kind === 'anchor'
          && left.pick.index === right.pick.index
        )
      : (
          right.pick.kind === 'segment'
          && left.pick.insertIndex === right.pick.insertIndex
          && left.pick.segmentIndex === right.pick.segmentIndex
          && left.pick.axis === right.pick.axis
        )
  )
)

export const isOverlayViewEqual = (
  left: EdgeOverlayView,
  right: EdgeOverlayView
): boolean => (
  left.previewPath?.svgPath === right.previewPath?.svgPath
  && (
    (left.previewPath === undefined && right.previewPath === undefined)
    || (
      left.previewPath !== undefined
      && right.previewPath !== undefined
      && isStaticStyleEqual(left.previewPath.style, right.previewPath.style)
    )
  )
  && equal.sameOptionalPoint(left.snapPoint, right.snapPoint)
  && equal.sameOrder(left.endpointHandles, right.endpointHandles, isOverlayHandleEqual)
  && equal.sameOrder(left.routePoints, right.routePoints, isOverlayRoutePointEqual)
)

const readNodeLocked = (
  context: RenderContext,
  nodeId: NodeId
): boolean => Boolean(context.working.graph.nodes.get(nodeId)?.base.node.locked)

const readSelectedEdgeId = (
  selection: RenderContext['current']['runtime']['editor']['interaction']['selection']
): EdgeId | undefined => (
  selection.nodeIds.length === 0
  && selection.edgeIds.length === 1
    ? selection.edgeIds[0]
    : undefined
)

const readSelectedEdgeRoutePoints = (input: {
  edgeId: EdgeId
  edge: Edge
  handles: readonly EdgeHandle[]
  activeRouteIndex?: number
}): readonly EdgeOverlayRoutePoint[] => {
  const isStepManual =
    (input.edge.type === 'elbow' || input.edge.type === 'fillet')
    && input.edge.route?.kind === 'manual'

  return input.handles.flatMap<EdgeOverlayRoutePoint>((handle) => {
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

const resolveRenderEdgeCapability = (input: {
  edge: Edge
  context: RenderContext
}) => {
  const locked = Boolean(input.edge.locked)
  const relationLocked = [input.edge.source, input.edge.target].some((end) => (
    edgeApi.guard.isNodeEnd(end) && readNodeLocked(input.context, end.nodeId)
  ))
  const canEdit = !locked

  return {
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit
  }
}

const buildOverlayView = (
  context: RenderContext
): EdgeOverlayView => {
  const previewPath = context.current.runtime.editor.state.preview.edgeGuide?.path
    ? {
        svgPath: context.current.runtime.editor.state.preview.edgeGuide.path.svgPath,
        style: edgeApi.render.staticStyle(
          context.current.runtime.editor.state.preview.edgeGuide.path.style
        )
      }
    : undefined
  const connect = context.current.runtime.editor.state.preview.edgeGuide?.connect
  const snapPoint = connect
    && (
      connect.resolution.mode === 'outline'
      || connect.resolution.mode === 'handle'
    )
    ? connect.resolution.pointWorld
    : undefined

  const selectedEdgeId = readSelectedEdgeId(context.current.runtime.editor.interaction.selection)
  if (!selectedEdgeId) {
    return {
      previewPath,
      snapPoint,
      endpointHandles: EMPTY_ENDPOINT_HANDLES,
      routePoints: EMPTY_ROUTE_POINTS
    }
  }

  const edgeView = context.working.graph.edges.get(selectedEdgeId)
  const edgeUi = context.working.ui.edges.get(selectedEdgeId)
  const ends = edgeView?.route.ends
  if (!edgeView || !ends) {
    return {
      previewPath,
      snapPoint,
      endpointHandles: EMPTY_ENDPOINT_HANDLES,
      routePoints: EMPTY_ROUTE_POINTS
    }
  }

  const capability = resolveRenderEdgeCapability({
    edge: edgeView.base.edge,
    context
  })
  const editingThisSelectedEdge =
    context.current.runtime.editor.state.edit?.kind === 'edge-label'
    && context.current.runtime.editor.state.edit.edgeId === selectedEdgeId
  const showEditHandles =
    context.current.runtime.editor.state.tool.type === 'select'
    && context.current.runtime.editor.interaction.chrome
    && !context.current.runtime.editor.interaction.editingEdge
    && !editingThisSelectedEdge

  return {
    previewPath,
    snapPoint,
    endpointHandles:
      showEditHandles && (capability.reconnectSource || capability.reconnectTarget)
        ? [
            ...(capability.reconnectSource
              ? [{
                  edgeId: selectedEdgeId,
                  end: 'source' as const,
                  point: ends.source.point
                }]
              : EMPTY_ENDPOINT_HANDLES),
            ...(capability.reconnectTarget
              ? [{
                  edgeId: selectedEdgeId,
                  end: 'target' as const,
                  point: ends.target.point
                }]
              : EMPTY_ENDPOINT_HANDLES)
          ]
        : EMPTY_ENDPOINT_HANDLES,
    routePoints:
      showEditHandles && capability.editRoute
        ? readSelectedEdgeRoutePoints({
            edgeId: selectedEdgeId,
            edge: edgeView.base.edge,
            handles: edgeView.route.handles,
            activeRouteIndex: edgeUi?.activeRouteIndex
          })
        : EMPTY_ROUTE_POINTS
  }
}

export const patchRenderOverlay = (
  context: RenderContext
): number => {
  if (!context.reset && !context.touched.overlay) {
    return 0
  }

  return reconcileValue({
    previous: context.working.render.overlay,
    next: buildOverlayView(context),
    equal: isOverlayViewEqual,
    write: (next) => {
      context.working.render.overlay = next
    },
    writeDelta: (changed) => {
      context.working.phase.render.chrome.edge = changed
    }
  })
}
