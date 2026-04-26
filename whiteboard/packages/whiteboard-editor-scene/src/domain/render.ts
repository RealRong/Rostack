import { equal } from '@shared/core'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  EdgeHandle
} from '@whiteboard/core/types/edge'
import type {
  Edge,
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  ViewPatchScope
} from '../contracts/delta'
import type {
  Input,
  SessionInput
} from '../contracts/editor'
import type {
  EdgeActiveView,
  EdgeLabelKey,
  EdgeLabelView,
  EdgeMaskView,
  EdgeOverlayRoutePoint,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from '../contracts/render'
import type { WorkingState } from '../contracts/working'

const EMPTY_ENDPOINT_HANDLES: EdgeOverlayView['endpointHandles'] = []
const EMPTY_ROUTE_POINTS: readonly EdgeOverlayRoutePoint[] = []
const STATIC_CHUNK_SIZE = 256

const readEdgeLabelKey = (
  edgeId: EdgeId,
  labelId: string
): EdgeLabelKey => `${edgeId}:${labelId}`

const readHoveredEdgeId = (
  hover: Input['interaction']['hover']
): EdgeId | undefined => hover.kind === 'edge'
  ? hover.edgeId
  : undefined

const readEditingEdgeId = (
  edit: SessionInput['edit']
): EdgeId | undefined => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readSelectedEdgeId = (
  selection: Input['interaction']['selection']
): EdgeId | undefined => (
  selection.nodeIds.length === 0
  && selection.edgeIds.length === 1
    ? selection.edgeIds[0]
    : undefined
)

const readNodeLocked = (
  working: WorkingState,
  nodeId: NodeId
): boolean => Boolean(working.graph.nodes.get(nodeId)?.base.node.locked)

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

const isStaticViewEqual = (
  left: EdgeStaticView,
  right: EdgeStaticView
): boolean => (
  left.id === right.id
  && left.styleKey === right.styleKey
  && isStaticStyleEqual(left.style, right.style)
  && equal.sameOrder(
    left.paths,
    right.paths,
    (currentLeft, currentRight) => (
      currentLeft.id === currentRight.id
      && currentLeft.svgPath === currentRight.svgPath
    )
  )
)

const isEditCaretEqual = (
  left: EdgeLabelView['caret'],
  right: EdgeLabelView['caret']
): boolean => left?.kind === right?.kind && (
  left?.kind !== 'point'
  || (
    right?.kind === 'point'
    && geometryApi.equal.point(left.client, right.client)
  )
)

const isLabelViewEqual = (
  left: EdgeLabelView,
  right: EdgeLabelView
): boolean => (
  left.key === right.key
  && left.edgeId === right.edgeId
  && left.labelId === right.labelId
  && geometryApi.equal.point(left.point, right.point)
  && left.angle === right.angle
  && left.text === right.text
  && left.displayText === right.displayText
  && left.style === right.style
  && left.editing === right.editing
  && left.selected === right.selected
  && isEditCaretEqual(left.caret, right.caret)
)

const isMaskRectEqual = (
  left: EdgeMaskView['rects'][number],
  right: EdgeMaskView['rects'][number]
): boolean => (
  left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
  && left.radius === right.radius
  && left.angle === right.angle
  && geometryApi.equal.point(left.center, right.center)
)

const isMaskViewEqual = (
  left: EdgeMaskView,
  right: EdgeMaskView
): boolean => (
  left.edgeId === right.edgeId
  && equal.sameOrder(left.rects, right.rects, isMaskRectEqual)
)

const isActiveViewEqual = (
  left: EdgeActiveView,
  right: EdgeActiveView
): boolean => (
  left.edgeId === right.edgeId
  && left.svgPath === right.svgPath
  && isStaticStyleEqual(left.style, right.style)
  && left.box?.pad === right.box?.pad
  && equal.sameOptionalRect(left.box?.rect, right.box?.rect)
  && left.state.hovered === right.state.hovered
  && left.state.selected === right.state.selected
  && left.state.editing === right.state.editing
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

const isOverlayViewEqual = (
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
  readNodeLocked: (nodeId: NodeId) => boolean
}) => {
  const locked = Boolean(input.edge.locked)
  const relationLocked = [input.edge.source, input.edge.target].some((end) => (
    edgeApi.guard.isNodeEnd(end) && input.readNodeLocked(end.nodeId)
  ))
  const canEdit = !locked

  return {
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit
  }
}

const buildActiveView = (input: {
  working: WorkingState
  interaction: Input['interaction']
  edgeId: EdgeId
}): EdgeActiveView | undefined => {
  const edge = input.working.graph.edges.get(input.edgeId)
  if (!edge?.route.svgPath) {
    return undefined
  }

  return {
    edgeId: input.edgeId,
    svgPath: edge.route.svgPath,
    style: edgeApi.render.staticStyle(edge.base.edge.style),
    box: edge.box,
    state: {
      hovered: input.interaction.hover.kind === 'edge'
        && input.interaction.hover.edgeId === input.edgeId,
      selected: input.interaction.selection.edgeIds.includes(input.edgeId),
      editing: input.working.ui.edges.get(input.edgeId)?.editingLabelId !== undefined
    }
  }
}

const buildOverlayView = (input: {
  working: WorkingState
  current: Input
}): EdgeOverlayView => {
  const previewPath = input.current.session.preview.edgeGuide?.path
    ? {
        svgPath: input.current.session.preview.edgeGuide.path.svgPath,
        style: edgeApi.render.staticStyle(
          input.current.session.preview.edgeGuide.path.style
        )
      }
    : undefined
  const connect = input.current.session.preview.edgeGuide?.connect
  const snapPoint = connect
    && (
      connect.resolution.mode === 'outline'
      || connect.resolution.mode === 'handle'
    )
    ? connect.resolution.pointWorld
    : undefined

  const selectedEdgeId = readSelectedEdgeId(input.current.interaction.selection)
  if (!selectedEdgeId) {
    return {
      previewPath,
      snapPoint,
      endpointHandles: EMPTY_ENDPOINT_HANDLES,
      routePoints: EMPTY_ROUTE_POINTS
    }
  }

  const edgeView = input.working.graph.edges.get(selectedEdgeId)
  const edgeUi = input.working.ui.edges.get(selectedEdgeId)
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
    readNodeLocked: (nodeId) => readNodeLocked(input.working, nodeId)
  })
  const editingThisSelectedEdge =
    input.current.session.edit?.kind === 'edge-label'
    && input.current.session.edit.edgeId === selectedEdgeId
  const showEditHandles =
    input.current.session.tool.type === 'select'
    && input.current.interaction.chrome
    && !input.current.interaction.editingEdge
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

const buildStaticState = (
  working: WorkingState
) => {
  const styleKeyByEdge = new Map<EdgeId, string>()
  const edgeIdsByStyleKey = new Map<string, readonly EdgeId[]>()
  const staticIdByEdge = new Map<EdgeId, EdgeStaticId>()
  const staticIdsByStyleKey = new Map<string, readonly EdgeStaticId[]>()
  const statics = new Map<EdgeStaticId, EdgeStaticView>()
  const buckets = new Map<string, {
    style: EdgeStaticView['style']
    paths: EdgeStaticView['paths'][number][]
  }>()

  working.items.forEach((item) => {
    if (item.kind !== 'edge') {
      return
    }

    const edge = working.graph.edges.get(item.id)
    if (!edge?.route.svgPath) {
      return
    }

    const styleKey = edgeApi.render.styleKey(edge.base.edge.style)
    const style = edgeApi.render.staticStyle(edge.base.edge.style)
    const current = buckets.get(styleKey)

    styleKeyByEdge.set(item.id, styleKey)
    if (current) {
      current.paths.push({
        id: item.id,
        svgPath: edge.route.svgPath
      })
      return
    }

    buckets.set(styleKey, {
      style,
      paths: [{
        id: item.id,
        svgPath: edge.route.svgPath
      }]
    })
  })

  buckets.forEach((bucket, styleKey) => {
    edgeIdsByStyleKey.set(
      styleKey,
      bucket.paths.map((path) => path.id)
    )

    const staticIds: EdgeStaticId[] = []

    for (let index = 0; index < bucket.paths.length; index += STATIC_CHUNK_SIZE) {
      const paths = bucket.paths.slice(index, index + STATIC_CHUNK_SIZE)
      const chunkIndex = Math.floor(index / STATIC_CHUNK_SIZE)
      const staticId = `${styleKey}:${chunkIndex}`

      staticIds.push(staticId)
      statics.set(staticId, {
        id: staticId,
        styleKey,
        style: bucket.style,
        paths
      })

      paths.forEach((path) => {
        staticIdByEdge.set(path.id, staticId)
      })
    }

    staticIdsByStyleKey.set(styleKey, staticIds)
  })

  return {
    styleKeyByEdge,
    edgeIdsByStyleKey,
    staticIdByEdge,
    staticIdsByStyleKey,
    statics
  }
}

const buildLabelsAndMasks = (
  working: WorkingState
) => {
  const labels = new Map<EdgeLabelKey, EdgeLabelView>()
  const masks = new Map<EdgeId, EdgeMaskView>()

  working.items.forEach((item) => {
    if (item.kind !== 'edge') {
      return
    }

    const edge = working.graph.edges.get(item.id)
    if (!edge || edge.route.labels.length === 0) {
      return
    }

    const edgeUi = working.ui.edges.get(item.id)
    const rects = edge.route.labels.map((label) => label.maskRect)
    masks.set(item.id, {
      edgeId: item.id,
      rects
    })

    edge.route.labels.forEach((label) => {
      const labelUi = edgeUi?.labels.get(label.labelId)
      const key = readEdgeLabelKey(item.id, label.labelId)

      labels.set(key, {
        key,
        edgeId: item.id,
        labelId: label.labelId,
        point: label.point,
        angle: label.angle,
        text: label.text,
        displayText: label.displayText,
        style: label.style,
        editing: labelUi?.editing ?? false,
        selected: edgeUi?.selected ?? false,
        caret: labelUi?.caret
      })
    })
  })

  return {
    labels,
    masks
  }
}

const readActiveEdgeIds = (
  current: Input
): ReadonlySet<EdgeId> => new Set<EdgeId>([
  ...current.interaction.selection.edgeIds,
  ...(current.interaction.hover.kind === 'edge'
    ? [current.interaction.hover.edgeId]
    : []),
  ...(current.session.edit?.kind === 'edge-label'
    ? [current.session.edit.edgeId]
    : [])
])

const patchStatics = (input: {
  working: WorkingState
  scope: ViewPatchScope
}): number => {
  if (!input.scope.reset && input.scope.statics.size === 0) {
    return 0
  }

  const previous = input.working.render.statics
  const next = buildStaticState(input.working)
  const nextStatics = new Map<EdgeStaticId, EdgeStaticView>()
  let count = 0

  next.statics.forEach((view, staticId) => {
    const previousView = previous.statics.get(staticId)
    const nextView = previousView && isStaticViewEqual(previousView, view)
      ? previousView
      : view
    nextStatics.set(staticId, nextView)
  })

  const ids = new Set<EdgeStaticId>([
    ...previous.statics.keys(),
    ...nextStatics.keys()
  ])
  ids.forEach((staticId) => {
    const previousView = previous.statics.get(staticId)
    const nextView = nextStatics.get(staticId)
    if (
      previousView === undefined && nextView !== undefined
      || previousView !== undefined && nextView === undefined
      || (
        previousView !== undefined
        && nextView !== undefined
        && !isStaticViewEqual(previousView, nextView)
      )
    ) {
      count += 1
    }
  })

  input.working.render.statics = {
    styleKeyByEdge: next.styleKeyByEdge,
    edgeIdsByStyleKey: next.edgeIdsByStyleKey,
    staticIdByEdge: next.staticIdByEdge,
    staticIdsByStyleKey: next.staticIdsByStyleKey,
    statics: nextStatics
  }

  return count
}

const patchLabelsAndMasks = (input: {
  working: WorkingState
  scope: ViewPatchScope
}): number => {
  if (
    !input.scope.reset
    && input.scope.labels.size === 0
    && input.scope.masks.size === 0
  ) {
    return 0
  }

  const previousLabels = input.working.render.labels
  const previousMasks = input.working.render.masks
  const built = buildLabelsAndMasks(input.working)
  const nextLabels = new Map<EdgeLabelKey, EdgeLabelView>()
  const nextMasks = new Map<EdgeId, EdgeMaskView>()
  let count = 0

  built.labels.forEach((view, key) => {
    const previous = previousLabels.get(key)
    nextLabels.set(
      key,
      previous && isLabelViewEqual(previous, view)
        ? previous
        : view
    )
  })
  built.masks.forEach((view, edgeId) => {
    const previous = previousMasks.get(edgeId)
    nextMasks.set(
      edgeId,
      previous && isMaskViewEqual(previous, view)
        ? previous
        : view
      )
  })

  new Set<EdgeLabelKey>([
    ...previousLabels.keys(),
    ...nextLabels.keys()
  ]).forEach((key) => {
    const previous = previousLabels.get(key)
    const next = nextLabels.get(key)
    if (
      previous === undefined && next !== undefined
      || previous !== undefined && next === undefined
      || (
        previous !== undefined
        && next !== undefined
        && !isLabelViewEqual(previous, next)
      )
    ) {
      count += 1
    }
  })
  new Set<EdgeId>([
    ...previousMasks.keys(),
    ...nextMasks.keys()
  ]).forEach((edgeId) => {
    const previous = previousMasks.get(edgeId)
    const next = nextMasks.get(edgeId)
    if (
      previous === undefined && next !== undefined
      || previous !== undefined && next === undefined
      || (
        previous !== undefined
        && next !== undefined
        && !isMaskViewEqual(previous, next)
      )
    ) {
      count += 1
    }
  })

  input.working.render.labels = nextLabels
  input.working.render.masks = nextMasks

  return count
}

const patchActive = (input: {
  working: WorkingState
  current: Input
  scope: ViewPatchScope
}): number => {
  const activeIds = readActiveEdgeIds(input.current)
  const previous = input.working.render.active
  let count = 0

  if (input.scope.reset) {
    const next = new Map<EdgeId, EdgeActiveView>()

    activeIds.forEach((edgeId) => {
      const view = buildActiveView({
        working: input.working,
        interaction: input.current.interaction,
        edgeId
      })
      if (!view) {
        return
      }

      next.set(edgeId, view)
    })

    new Set<EdgeId>([
      ...previous.keys(),
      ...next.keys()
    ]).forEach((edgeId) => {
      const previousView = previous.get(edgeId)
      const nextView = next.get(edgeId)
      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isActiveViewEqual(previousView, nextView)
        )
      ) {
        count += 1
      }
    })

    input.working.render.active = next
    return count
  }

  input.scope.active.forEach((edgeId) => {
    const previousView = previous.get(edgeId)
    const nextCandidate = activeIds.has(edgeId)
      ? buildActiveView({
          working: input.working,
          interaction: input.current.interaction,
          edgeId
        })
      : undefined
    const nextView = previousView && nextCandidate && isActiveViewEqual(previousView, nextCandidate)
      ? previousView
      : nextCandidate

    if (nextView === undefined) {
      previous.delete(edgeId)
    } else {
      previous.set(edgeId, nextView)
    }

    if (
      previousView === undefined && nextView !== undefined
      || previousView !== undefined && nextView === undefined
      || (
        previousView !== undefined
        && nextView !== undefined
        && !isActiveViewEqual(previousView, nextView)
      )
    ) {
      count += 1
    }
  })

  return count
}

const patchOverlay = (input: {
  working: WorkingState
  current: Input
  scope: ViewPatchScope
}): number => {
  if (!input.scope.reset && !input.scope.overlay) {
    return 0
  }

  const previous = input.working.render.overlay
  const nextCandidate = buildOverlayView({
    working: input.working,
    current: input.current
  })
  const next = isOverlayViewEqual(previous, nextCandidate)
    ? previous
    : nextCandidate

  input.working.render.overlay = next
  return next !== previous ? 1 : 0
}

export const patchRenderState = (input: {
  working: WorkingState
  current: Input
  scope: ViewPatchScope
}): number => (
  patchStatics(input)
  + patchLabelsAndMasks(input)
  + patchActive(input)
  + patchOverlay(input)
)
