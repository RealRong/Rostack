import { isPointEqual } from '@whiteboard/core/geometry'
import {
  getEdgePathBounds,
  isNodeEdgeEnd,
  isPointEdgeEnd,
  buildEdgeLabelMaskRect,
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacement,
  resolveEdgeLabelPlacementSize,
  sameEdgeAnchor,
  sameResolvedEdgeEnd,
  type EdgeConnectCandidate,
  matchEdgeRect,
  type EdgeView as CoreEdgeView,
  type EdgeLabelMaskRect
} from '@whiteboard/core/edge'
import type { SelectionTarget } from '@whiteboard/core/selection'
import {
  createDerivedStore,
  sameRect,
  sameOptionalRect as isSameOptionalRectTuple,
  sameOrder as isOrderedArrayEqual,
  samePointArray as isSamePointArray
} from '@shared/core'
import type { Edge, EdgeId, Node, NodeId, NodeType, Point, Rect, Size } from '@whiteboard/core/types'
import {
  type EdgeItem,
  type EngineRead
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  presentValues,
  read as readValue,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type {
  EdgePreviewProjection
} from '@whiteboard/editor/input/preview/types'
import type { EditorInputState } from '@whiteboard/editor/input/state'
import type { NodeCanvasSnapshot, NodePresentationRead } from '@whiteboard/editor/query/node/read'
import type { EditSession } from '@whiteboard/editor/local/session/edit'
import type { Tool } from '@whiteboard/editor/types/tool'
import { readEdgeLabelTextSourceId } from '@whiteboard/editor/types/layout'
import {
  projectEdgeItem,
  readProjectedEdgeView
} from '@whiteboard/editor/query/edge/projection'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'

export type EdgeRuntimeState = {
  patched: boolean
  activeRouteIndex?: number
}

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
  point: CoreEdgeView['handles'][number]['point']
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
  ends: EdgeView['ends']
  canReconnectSource: boolean
  canReconnectTarget: boolean
  canEditRoute: boolean
  showEditHandles: boolean
  routePoints: readonly SelectedEdgeRoutePoint[]
}

export type EdgeView = CoreEdgeView & {
  edgeId: EdgeId
  edge: EdgeItem['edge']
  patched: boolean
  activeRouteIndex: number | undefined
}

export type EdgeLabelRender = {
  id: string
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editable: boolean
  caret?: Extract<NonNullable<EditSession>, { kind: 'edge-label' }>['caret']
  sourceId: string
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
}

export type EdgeRender = EdgeView & {
  selected: boolean
  box: EdgeBox
  labels: EdgeLabelRender[]
}

const EDGE_CAPABILITY_BASE = {
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true,
  editLabel: true
} as const

const isEdgeItemEqual = (
  left: EdgeItem | undefined,
  right: EdgeItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.id === right.id
    && left.edge === right.edge
    && left?.ends.source.end.kind === right?.ends.source.end.kind
    && left?.ends.target.end.kind === right?.ends.target.end.kind
    && sameEdgeAnchor(left?.ends.source.anchor, right?.ends.source.anchor)
    && sameEdgeAnchor(left?.ends.target.anchor, right?.ends.target.anchor)
    && isPointEqual(left?.ends.source.point, right?.ends.source.point)
    && isPointEqual(left?.ends.target.point, right?.ends.target.point)
  )
)

const isEdgePathSegmentEqual = (
  left: CoreEdgeView['path']['segments'][number],
  right: CoreEdgeView['path']['segments'][number]
) => (
  left === right
  || (
    left.role === right.role
    && left.insertIndex === right.insertIndex
    && isPointEqual(left.from, right.from)
    && isPointEqual(left.to, right.to)
    && isPointEqual(left.insertPoint, right.insertPoint)
    && isSamePointArray(left.hitPoints, right.hitPoints)
  )
)

const isEdgeHandleEqual = (
  left: CoreEdgeView['handles'][number],
  right: CoreEdgeView['handles'][number]
) => {
  if (left === right) {
    return true
  }
  if (left.kind !== right.kind) {
    return false
  }
  if (!isPointEqual(left.point, right.point)) {
    return false
  }

  switch (left.kind) {
    case 'end':
      return right.kind === 'end' && left.end === right.end
    case 'anchor':
      return (
        right.kind === 'anchor'
        && left.index === right.index
        && left.mode === right.mode
      )
    case 'segment':
      return (
        right.kind === 'segment'
        && left.role === right.role
        && left.insertIndex === right.insertIndex
        && left.segmentIndex === right.segmentIndex
        && left.axis === right.axis
      )
  }
}

const isEdgeViewEqual = (
  left: CoreEdgeView | undefined,
  right: CoreEdgeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && sameResolvedEdgeEnd(left.ends.source, right.ends.source)
    && sameResolvedEdgeEnd(left.ends.target, right.ends.target)
    && left.path.svgPath === right.path.svgPath
    && isSamePointArray(left.path.points, right.path.points)
    && isPointEqual(left.path.label, right.path.label)
    && isOrderedArrayEqual(
      left.path.segments,
      right.path.segments,
      isEdgePathSegmentEqual
    )
    && isOrderedArrayEqual(
      left.handles,
      right.handles,
      isEdgeHandleEqual
    )
  )
)

const resolveEdgeCapability = (
  edge: EdgeItem['edge'],
  readNodeLocked: (nodeId: NodeId) => boolean
): EdgeCapability => {
  const locked = Boolean(edge.locked)
  const relationLocked = [edge.source, edge.target].some((end) => (
    isNodeEdgeEnd(end) && readNodeLocked(end.nodeId)
  ))
  const canEdit = !locked

  return {
    ...EDGE_CAPABILITY_BASE,
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit,
    editLabel: canEdit,
    move: canEdit && isPointEdgeEnd(edge.source) && isPointEdgeEnd(edge.target)
  }
}

export type EdgePresentationRead = {
  list: EngineRead['edge']['list']
  committed: EngineRead['edge']['item']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  state: KeyedReadStore<EdgeId, EdgeRuntimeState>
  resolved: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  view: KeyedReadStore<EdgeId, EdgeView | undefined>
  render: KeyedReadStore<EdgeId, EdgeRender | undefined>
  bounds: KeyedReadStore<EdgeId, Rect | undefined>
  box: (edgeId: EdgeId) => EdgeBox | undefined
  capability: (edge: EdgeItem['edge']) => EdgeCapability
  selectedChrome: ReadStore<SelectedEdgeChrome | undefined>
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }) => EdgeId[]
  connectCandidates: (rect: Rect) => readonly EdgeConnectCandidate[]
}

const isEdgeStateEqual = (
  left: EdgeRuntimeState,
  right: EdgeRuntimeState
) => (
  left.patched === right.patched
  && left.activeRouteIndex === right.activeRouteIndex
)

const toEdgeRuntimeState = (
  feedback: EdgePreviewProjection
): EdgeRuntimeState => ({
  patched: Boolean(feedback.patch),
  activeRouteIndex: feedback.activeRouteIndex
})

const isEdgeViewStateEqual = (
  left: EdgeView | undefined,
  right: EdgeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.edgeId === right.edgeId
    && left.edge === right.edge
    && left.patched === right.patched
    && left.activeRouteIndex === right.activeRouteIndex
    && isEdgeViewEqual(left, right)
  )
)

const isEdgeLabelMaskRectEqual = (
  left: EdgeLabelMaskRect,
  right: EdgeLabelMaskRect
) => (
  left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
  && left.radius === right.radius
  && left.angle === right.angle
  && isPointEqual(left.center, right.center)
)

const isEdgeLabelRenderEqual = (
  left: EdgeLabelRender,
  right: EdgeLabelRender
) => (
  left === right
  || (
    left.id === right.id
    && left.text === right.text
    && left.displayText === right.displayText
    && left.style === right.style
    && left.editable === right.editable
    && left.sourceId === right.sourceId
    && left.angle === right.angle
    && isPointEqual(left.point, right.point)
    && left.size.width === right.size.width
    && left.size.height === right.size.height
    && isEdgeLabelMaskRectEqual(left.maskRect, right.maskRect)
    && left.caret?.kind === right.caret?.kind
    && (
      left.caret?.kind !== 'point'
      || (
        right.caret?.kind === 'point'
        && left.caret.client.x === right.caret.client.x
        && left.caret.client.y === right.caret.client.y
      )
    )
  )
)

const isEdgeRenderEqual = (
  left: EdgeRender | undefined,
  right: EdgeRender | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && isEdgeViewStateEqual(left, right)
    && left.selected === right.selected
    && left.box.pad === right.box.pad
    && sameRect(left.box.rect, right.box.rect)
    && isOrderedArrayEqual(left.labels, right.labels, isEdgeLabelRenderEqual)
  )
)

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
    || !isPointEqual(left.point, right.point)
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

const isSelectedEdgeChromeEqual = (
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
    && sameResolvedEdgeEnd(left.ends.source, right.ends.source)
    && sameResolvedEdgeEnd(left.ends.target, right.ends.target)
    && isOrderedArrayEqual(
      left.routePoints,
      right.routePoints,
      isSelectedEdgeRoutePointEqual
    )
  )
)

const readEdgeBox = (
  rect: Rect | undefined,
  edge: EdgeItem['edge'] | undefined
): EdgeBox | undefined => {
  if (!rect || !edge) {
    return undefined
  }

  return {
    rect,
    pad: Math.max(24, (edge.style?.width ?? 2) + 16)
  }
}

const readSelectedEdgeId = (
  selection: SelectionTarget
): EdgeId | undefined => (
  selection.nodeIds.length === 0
  && selection.edgeIds.length === 1
    ? selection.edgeIds[0]
    : undefined
)

const readSelectedEdgeRoutePoints = (
  edgeId: EdgeId,
  entry: EdgeView
): readonly SelectedEdgeRoutePoint[] => {
  const isStepManual =
    (entry.edge.type === 'elbow' || entry.edge.type === 'fillet')
    && entry.edge.route?.kind === 'manual'

  return entry.handles.flatMap<SelectedEdgeRoutePoint>((handle) => {
    if (handle.kind === 'anchor') {
      if (isStepManual) {
        return []
      }

      return [{
        key: `${edgeId}:anchor:${handle.index}`,
        kind: 'anchor',
        edgeId,
        point: handle.point,
        active: entry.activeRouteIndex === handle.index,
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
        active: entry.activeRouteIndex === handle.insertIndex,
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

const isEdgeInteractionBlockingChrome = (
  mode: ReturnType<EditorInputState['mode']['get']>
) => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

const EDGE_LABEL_PLACEHOLDER = 'Label'
const isEdgeSelected = (
  selection: SelectionTarget,
  edgeId: EdgeId
) => selection.edgeIds.includes(edgeId)

const readLabelText = (
  value: string | undefined
) => typeof value === 'string'
  ? value
  : ''

const readLabelDisplayText = (
  value: string,
  editing: boolean
) => value || (editing ? EDGE_LABEL_PLACEHOLDER : '')

const readEdgeLabelRender = ({
  edgeId,
  path,
  textMode,
  label,
  edit,
  layout
}: {
  edgeId: EdgeId
  path: EdgeView['path']
  textMode: NonNullable<Edge['textMode']>
  label: NonNullable<Edge['labels']>[number]
  edit: EditSession
  layout: Pick<EditorLayout, 'measureText'>
}): EdgeLabelRender | undefined => {
  const text = readLabelText(label.text)
  const editing = (
    edit?.kind === 'edge-label'
    && edit.edgeId === edgeId
    && edit.labelId === label.id
  )
  const displayText = readLabelDisplayText(text, editing)
  if (!displayText.trim()) {
    return undefined
  }

  const style = label.style
  const fontSize = style?.size ?? 14
  const sourceId = readEdgeLabelTextSourceId(edgeId, label.id)
  const measuredSize = layout.measureText({
    sourceId,
    typography: 'edge-label',
    text,
    placeholder: EDGE_LABEL_PLACEHOLDER,
    widthMode: 'auto',
    fontSize,
    fontWeight: style?.weight ?? 400,
    fontStyle: style?.italic
      ? 'italic'
      : 'normal'
  })
  const placementSize = resolveEdgeLabelPlacementSize({
    textMode,
    measuredSize,
    text: displayText,
    fontSize
  })
  if (!placementSize) {
    return undefined
  }

  const placement = resolveEdgeLabelPlacement({
    path,
    t: label.t ?? 0.5,
    offset: label.offset ?? 0,
    textMode,
    labelSize: placementSize,
    sideGap: readEdgeLabelSideGap(textMode)
  })
  if (!placement) {
    return undefined
  }

  const angle = textMode === 'tangent'
    ? placement.angle
    : 0

  return {
    id: label.id,
    text,
    displayText,
    style,
    editable: editing,
    caret: editing ? edit.caret : undefined,
    sourceId,
    point: placement.point,
    angle,
    size: placementSize,
    maskRect: buildEdgeLabelMaskRect({
      center: placement.point,
      size: placementSize,
      angle
    })
  }
}

export const createEdgeRead = ({
  read,
  node,
  feedback,
  edit,
  selection,
  tool,
  interaction,
  layout,
  capability
}: {
  read: Pick<EngineRead, 'edge'>
  node: Pick<NodePresentationRead, 'canvas' | 'idsInRect'>
  feedback: KeyedReadStore<EdgeId, EdgePreviewProjection>
  edit: ReadStore<EditSession>
  selection: ReadStore<SelectionTarget>
  tool: ReadStore<Tool>
  interaction: Pick<EditorInputState, 'mode' | 'chrome'>
  layout: Pick<EditorLayout, 'measureText'>
  capability: (node: Pick<Node, 'type'> | NodeType) => {
    connect: boolean
  }
}): EdgePresentationRead => {
  const item: EdgePresentationRead['item'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = readValue(read.edge.item, edgeId)
      return entry
        ? projectEdgeItem(entry, readValue(feedback, edgeId), readValue(edit))
        : undefined
    },
    isEqual: isEdgeItemEqual
  })
  const state: EdgePresentationRead['state'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => toEdgeRuntimeState(
      readValue(feedback, edgeId)
    ),
    isEqual: isEdgeStateEqual
  })
  const resolved: EdgePresentationRead['resolved'] = createKeyedDerivedStore({
    isEqual: isEdgeViewEqual,
    get: (edgeId: EdgeId) => {
      const entry = readValue(item, edgeId)
      return entry
        ? readProjectedEdgeView(node, entry)
        : undefined
    }
  })
  const view: EdgePresentationRead['view'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const resolvedItem = readValue(item, edgeId)
      const resolvedView = readValue(resolved, edgeId)
      if (!resolvedItem || !resolvedView) {
        return undefined
      }

      return {
        edgeId,
        edge: resolvedItem.edge,
        patched: readValue(state, edgeId).patched,
        activeRouteIndex: readValue(state, edgeId).activeRouteIndex,
        ...resolvedView
      }
    },
    isEqual: isEdgeViewStateEqual
  })
  const bounds: EdgePresentationRead['bounds'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const resolvedEntry = readValue(resolved, edgeId)
      return resolvedEntry
        ? getEdgePathBounds(resolvedEntry.path)
        : undefined
    },
    isEqual: isSameOptionalRectTuple
  })
  const render: EdgePresentationRead['render'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentView = readValue(view, edgeId)
      const currentBox = readEdgeBox(
        readValue(bounds, edgeId),
        currentView?.edge
      )
      if (!currentView || !currentBox) {
        return undefined
      }

      const currentEdit = readValue(edit)
      const textMode = currentView.edge.textMode ?? 'horizontal'

      return {
        ...currentView,
        selected: isEdgeSelected(readValue(selection), edgeId),
        box: currentBox,
        labels: (currentView.edge.labels ?? []).flatMap((label) => {
          const next = readEdgeLabelRender({
            edgeId,
            path: currentView.path,
            textMode,
            label,
            edit: currentEdit,
            layout
          })

          return next
            ? [next]
            : []
        })
      }
    },
    isEqual: isEdgeRenderEqual
  })

  const connectCandidates: EdgePresentationRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = node.idsInRect(rect)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const snapshot = readValue(node.canvas, nodeIds[index])
      if (!snapshot || !capability(snapshot.node).connect) {
        continue
      }

      candidates.push({
        nodeId: snapshot.node.id,
        node: snapshot.node,
        geometry: snapshot.geometry
      })
    }

    return candidates
  }
  const readNodeLocked = (
    nodeId: NodeId
  ) => Boolean(readValue(node.canvas, nodeId)?.node.locked)
  const selectedChrome: EdgePresentationRead['selectedChrome'] = createDerivedStore({
    get: () => {
      const selectedEdgeId = readSelectedEdgeId(readValue(selection))
      if (!selectedEdgeId) {
        return undefined
      }

      const currentView = readValue(view, selectedEdgeId)
      if (!currentView) {
        return undefined
      }

      const currentCapability = resolveEdgeCapability(currentView.edge, readNodeLocked)
      const currentEdit = readValue(edit)
      const interactionMode = readValue(interaction.mode)
      const editingThisSelectedEdge =
        currentEdit?.kind === 'edge-label'
        && currentEdit.edgeId === selectedEdgeId

      return {
        edgeId: selectedEdgeId,
        ends: currentView.ends,
        canReconnectSource: currentCapability.reconnectSource,
        canReconnectTarget: currentCapability.reconnectTarget,
        canEditRoute: currentCapability.editRoute,
        showEditHandles:
          readValue(tool).type === 'select'
          && readValue(interaction.chrome)
          && !isEdgeInteractionBlockingChrome(interactionMode)
          && !editingThisSelectedEdge,
        routePoints: readSelectedEdgeRoutePoints(selectedEdgeId, currentView)
      }
    },
    isEqual: isSelectedEdgeChromeEqual
  })

  return {
    list: read.edge.list,
    committed: read.edge.item,
    item,
    edges: (edgeIds) => presentValues(edgeIds, (edgeId) => readValue(item, edgeId)?.edge),
    state,
    resolved,
    view,
    render,
    bounds,
    box: (edgeId) => readEdgeBox(
      readValue(bounds, edgeId),
      readValue(item, edgeId)?.edge
    ),
    capability: (edge) => resolveEdgeCapability(edge, readNodeLocked),
    selectedChrome,
    related: read.edge.related,
    idsInRect: (rect, options) => readValue(read.edge.list).filter((edgeId) => {
      const nextResolved = readValue(resolved, edgeId)
      if (!nextResolved) {
        return false
      }

      return matchEdgeRect({
        path: nextResolved.path,
        queryRect: rect,
        mode: options?.match ?? 'touch'
      })
    }),
    connectCandidates
  }
}
