import { isPointEqual } from '@whiteboard/core/geometry'
import {
  applyEdgePatch,
  buildEdgeLabelMaskRect,
  getEdgePathBounds,
  isNodeEdgeEnd,
  isPointEdgeEnd,
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacement,
  resolveEdgeLabelPlacementSize,
  resolveEdgeView,
  sameEdgeAnchor,
  sameResolvedEdgeEnd,
  type EdgeConnectCandidate,
  type EdgeLabelMaskRect,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import type { SelectionTarget } from '@whiteboard/core/selection'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  presentValues,
  read as readValue,
  sameOptionalRect as isSameOptionalRectTuple,
  sameOrder as isOrderedArrayEqual,
  samePointArray as isSamePointArray,
  sameRect,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { Edge, EdgeId, Node, NodeId, Point, Rect, Size } from '@whiteboard/core/types'
import type {
  EdgeItem,
  EngineRead
} from '@whiteboard/engine'
import type {
  EdgePreviewProjection
} from '@whiteboard/editor/session/preview/types'
import type { EditorInputState } from '@whiteboard/editor/session/interaction'
import type { NodeCanvasSnapshot, NodePresentationRead } from '@whiteboard/editor/query/node/read'
import type { EditCaret, EditSession } from '@whiteboard/editor/session/edit'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { TextMetricsCache, TextMetricsSpec } from '@whiteboard/editor/types/layout'
import {
  EDGE_LABEL_MASK_BLEED,
  buildEdgeLabelTextMetricsSpec,
  readEdgeLabelDisplayText,
  readEdgeLabelText
} from '@whiteboard/editor/edge/label'
import type { EdgeLabelEditView } from '@whiteboard/editor/query/edit/read'

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
  ends: CoreEdgeView['ends']
  canReconnectSource: boolean
  canReconnectTarget: boolean
  canEditRoute: boolean
  showEditHandles: boolean
  routePoints: readonly SelectedEdgeRoutePoint[]
}

export type EdgeLabelRef = {
  edgeId: EdgeId
  labelId: string
}

export type EdgeLabelContent = {
  ref: EdgeLabelRef
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editable: boolean
  caret?: EditCaret
  textMode: NonNullable<Edge['textMode']>
  t: number
  offset: number
  metrics: TextMetricsSpec
}

export type EdgeLabelPlacement = {
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
}

export type EdgeLabelRender = {
  id: string
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editable: boolean
  caret?: EditCaret
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
}

export type EdgeRender = CoreEdgeView & {
  edgeId: EdgeId
  edge: EdgeItem['edge']
  patched: boolean
  activeRouteIndex: number | undefined
  selected: boolean
  box: EdgeBox
  labels: EdgeLabelRender[]
}

export type EdgePresentationRead = {
  list: EngineRead['edge']['list']
  committed: EngineRead['edge']['item']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
  geometry: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  render: KeyedReadStore<EdgeId, EdgeRender | undefined>
  label: {
    list: (edgeId: EdgeId) => readonly EdgeLabelRef[]
    content: (ref: EdgeLabelRef) => EdgeLabelContent | undefined
    metrics: (ref: EdgeLabelRef) => Size | undefined
    placement: (ref: EdgeLabelRef) => EdgeLabelPlacement | undefined
    render: (ref: EdgeLabelRef) => EdgeLabelRender | undefined
  }
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

type EdgeRuntime = {
  patched: boolean
  activeRouteIndex?: number
  selected: boolean
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
    && left.ends.source.end.kind === right.ends.source.end.kind
    && left.ends.target.end.kind === right.ends.target.end.kind
    && sameEdgeAnchor(left.ends.source.anchor, right.ends.source.anchor)
    && sameEdgeAnchor(left.ends.target.anchor, right.ends.target.anchor)
    && isPointEqual(left.ends.source.point, right.ends.source.point)
    && isPointEqual(left.ends.target.point, right.ends.target.point)
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

const isEdgeGeometryEqual = (
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

const readEdgeRuntime = ({
  feedback,
  selected
}: {
  feedback: EdgePreviewProjection
  selected: boolean
}): EdgeRuntime => ({
  patched: Boolean(feedback.patch),
  activeRouteIndex: feedback.activeRouteIndex,
  selected
})

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

const readEdgeLabelRefKey = (
  ref: EdgeLabelRef
) => `${ref.edgeId}\u0001${ref.labelId}`

const isEdgeLabelContentEqual = (
  left: EdgeLabelContent | undefined,
  right: EdgeLabelContent | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.ref.edgeId === right.ref.edgeId
    && left.ref.labelId === right.ref.labelId
    && left.text === right.text
    && left.displayText === right.displayText
    && left.style === right.style
    && left.editable === right.editable
    && left.textMode === right.textMode
    && left.t === right.t
    && left.offset === right.offset
    && left.metrics.profile === right.metrics.profile
    && left.metrics.text === right.metrics.text
    && left.metrics.placeholder === right.metrics.placeholder
    && left.metrics.fontSize === right.metrics.fontSize
    && left.metrics.fontWeight === right.metrics.fontWeight
    && left.metrics.fontStyle === right.metrics.fontStyle
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
    && left.edgeId === right.edgeId
    && left.edge === right.edge
    && left.patched === right.patched
    && left.activeRouteIndex === right.activeRouteIndex
    && left.selected === right.selected
    && left.box.pad === right.box.pad
    && sameRect(left.box.rect, right.box.rect)
    && isEdgeGeometryEqual(left, right)
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

const readSelectedEdgeRoutePoints = ({
  edgeId,
  edge,
  geometry,
  activeRouteIndex
}: {
  edgeId: EdgeId
  edge: Edge
  geometry: CoreEdgeView
  activeRouteIndex?: number
}): readonly SelectedEdgeRoutePoint[] => {
  const isStepManual =
    (edge.type === 'elbow' || edge.type === 'fillet')
    && edge.route?.kind === 'manual'

  return geometry.handles.flatMap<SelectedEdgeRoutePoint>((handle) => {
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

const isEdgeInteractionBlockingChrome = (
  mode: ReturnType<EditorInputState['mode']['get']>
) => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

const readResolvedNodeSnapshot = (
  readNode: Pick<NodePresentationRead, 'canvas'>,
  edgeEnd: EdgeItem['edge']['source'] | EdgeItem['edge']['target']
): NodeCanvasSnapshot | undefined => edgeEnd.kind === 'node'
  ? readValue(readNode.canvas, edgeEnd.nodeId)
  : undefined

const readEdgeGeometry = (
  node: Pick<NodePresentationRead, 'canvas'>,
  entry: EdgeItem
): CoreEdgeView | undefined => {
  const source = readResolvedNodeSnapshot(node, entry.edge.source)
  const target = readResolvedNodeSnapshot(node, entry.edge.target)

  if (
    (entry.edge.source.kind === 'node' && !source)
    || (entry.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return resolveEdgeView({
      edge: entry.edge,
      source,
      target
    })
  } catch {
    return undefined
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
  textMetrics,
  capability
}: {
  read: Pick<EngineRead, 'edge'>
  node: Pick<NodePresentationRead, 'canvas' | 'idsInRect'>
  feedback: KeyedReadStore<EdgeId, EdgePreviewProjection>
  edit: {
    session: ReadStore<EditSession>
    edgeLabel: KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
  }
  selection: {
    target: ReadStore<SelectionTarget>
    selected: KeyedReadStore<EdgeId, boolean>
  }
  tool: ReadStore<Tool>
  interaction: Pick<EditorInputState, 'mode' | 'chrome'>
  textMetrics: Pick<TextMetricsCache, 'read'>
  capability: (node: Pick<Node, 'type' | 'mindmapId'>) => {
    connect: boolean
  }
}): EdgePresentationRead => {
  const item: EdgePresentationRead['item'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = readValue(read.edge.item, edgeId)
      if (!entry) {
        return undefined
      }

      const nextEdge = applyEdgePatch(entry.edge, readValue(feedback, edgeId).patch)
      return nextEdge === entry.edge
        ? entry
        : {
            ...entry,
            edge: nextEdge
          }
    },
    isEqual: isEdgeItemEqual
  })

  const geometry: EdgePresentationRead['geometry'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = readValue(item, edgeId)
      return entry
        ? readEdgeGeometry(node, entry)
        : undefined
    },
    isEqual: isEdgeGeometryEqual
  })

  const labelContent = createKeyedDerivedStore<EdgeLabelRef, EdgeLabelContent | undefined>({
    keyOf: readEdgeLabelRefKey,
    get: (ref) => {
      const currentItem = readValue(item, ref.edgeId)
      const label = currentItem?.edge.labels?.find((entry) => entry.id === ref.labelId)
      if (!currentItem || !label) {
        return undefined
      }

      const currentEdit = readValue(edit.edgeLabel, ref.edgeId)
      const editing = currentEdit?.labelId === ref.labelId
      const text = editing
        ? currentEdit.text
        : readEdgeLabelText(label.text)
      const displayText = readEdgeLabelDisplayText(text, editing)
      if (!editing && !displayText.trim()) {
        return undefined
      }

      return {
        ref,
        text,
        displayText,
        style: label.style,
        editable: editing,
        caret: editing ? currentEdit.caret : undefined,
        textMode: currentItem.edge.textMode ?? 'horizontal',
        t: label.t ?? 0.5,
        offset: label.offset ?? 0,
        metrics: buildEdgeLabelTextMetricsSpec({
          text,
          style: label.style
        })
      }
    },
    isEqual: isEdgeLabelContentEqual
  })

  const bounds: EdgePresentationRead['bounds'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentGeometry = readValue(geometry, edgeId)
      return currentGeometry
        ? getEdgePathBounds(currentGeometry.path)
        : undefined
    },
    isEqual: isSameOptionalRectTuple
  })

  const readLabelRefs = (
    edgeId: EdgeId
  ): readonly EdgeLabelRef[] => readValue(item, edgeId)?.edge.labels?.map((label) => ({
      edgeId,
      labelId: label.id
    })) ?? []

  const readLabelMetrics = (
    ref: EdgeLabelRef
  ): Size | undefined => {
    const currentContent = readValue(labelContent, ref)
    if (!currentContent) {
      return undefined
    }

    const measuredSize = textMetrics.read(currentContent.metrics)
    return resolveEdgeLabelPlacementSize({
      textMode: currentContent.textMode,
      measuredSize,
      text: currentContent.displayText,
      fontSize: currentContent.metrics.fontSize
    })
  }

  const readLabelPlacement = (
    ref: EdgeLabelRef
  ): EdgeLabelPlacement | undefined => {
    const currentGeometry = readValue(geometry, ref.edgeId)
    const currentContent = readValue(labelContent, ref)
    const currentSize = readLabelMetrics(ref)
    if (!currentGeometry || !currentContent || !currentSize) {
      return undefined
    }

    const placement = resolveEdgeLabelPlacement({
      path: currentGeometry.path,
      t: currentContent.t,
      offset: currentContent.offset,
      textMode: currentContent.textMode,
      labelSize: currentSize,
      sideGap: readEdgeLabelSideGap(currentContent.textMode)
    })
    if (!placement) {
      return undefined
    }

    const angle = currentContent.textMode === 'tangent'
      ? placement.angle
      : 0

    return {
      point: placement.point,
      angle,
      size: currentSize,
      maskRect: buildEdgeLabelMaskRect({
        center: placement.point,
        size: currentSize,
        angle,
        margin: EDGE_LABEL_MASK_BLEED
      })
    }
  }

  const readLabelRender = (
    ref: EdgeLabelRef
  ): EdgeLabelRender | undefined => {
    const currentContent = readValue(labelContent, ref)
    const currentPlacement = readLabelPlacement(ref)
    if (!currentContent || !currentPlacement) {
      return undefined
    }

    return {
      id: ref.labelId,
      text: currentContent.text,
      displayText: currentContent.displayText,
      style: currentContent.style,
      editable: currentContent.editable,
      caret: currentContent.caret,
      point: currentPlacement.point,
      angle: currentPlacement.angle,
      size: currentPlacement.size,
      maskRect: currentPlacement.maskRect
    }
  }

  const render: EdgePresentationRead['render'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentItem = readValue(item, edgeId)
      const currentGeometry = readValue(geometry, edgeId)
      const currentBox = readEdgeBox(
        readValue(bounds, edgeId),
        currentItem?.edge
      )
      if (!currentItem || !currentGeometry || !currentBox) {
        return undefined
      }

      const runtime = readEdgeRuntime({
        feedback: readValue(feedback, edgeId),
        selected: readValue(selection.selected, edgeId)
      })

      return {
        edgeId,
        edge: currentItem.edge,
        patched: runtime.patched,
        activeRouteIndex: runtime.activeRouteIndex,
        selected: runtime.selected,
        box: currentBox,
        labels: readLabelRefs(edgeId).flatMap((ref) => {
          const next = readLabelRender(ref)
          return next ? [next] : []
        }),
        ...currentGeometry
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
      const selectedEdgeId = readSelectedEdgeId(readValue(selection.target))
      if (!selectedEdgeId) {
        return undefined
      }

      const currentItem = readValue(item, selectedEdgeId)
      const currentGeometry = readValue(geometry, selectedEdgeId)
      if (!currentItem || !currentGeometry) {
        return undefined
      }

      const currentCapability = resolveEdgeCapability(currentItem.edge, readNodeLocked)
      const currentEdit = readValue(edit.session)
      const interactionMode = readValue(interaction.mode)
      const currentRuntime = readEdgeRuntime({
        feedback: readValue(feedback, selectedEdgeId),
        selected: true
      })
      const editingThisSelectedEdge =
        currentEdit?.kind === 'edge-label'
        && currentEdit.edgeId === selectedEdgeId

      return {
        edgeId: selectedEdgeId,
        ends: currentGeometry.ends,
        canReconnectSource: currentCapability.reconnectSource,
        canReconnectTarget: currentCapability.reconnectTarget,
        canEditRoute: currentCapability.editRoute,
        showEditHandles:
          readValue(tool).type === 'select'
          && readValue(interaction.chrome)
          && !isEdgeInteractionBlockingChrome(interactionMode)
          && !editingThisSelectedEdge,
        routePoints: readSelectedEdgeRoutePoints({
          edgeId: selectedEdgeId,
          edge: currentItem.edge,
          geometry: currentGeometry,
          activeRouteIndex: currentRuntime.activeRouteIndex
        })
      }
    },
    isEqual: isSelectedEdgeChromeEqual
  })

  return {
    list: read.edge.list,
    committed: read.edge.item,
    item,
    geometry,
    edges: (edgeIds) => presentValues(edgeIds, (edgeId) => readValue(item, edgeId)?.edge),
    render,
    label: {
      list: readLabelRefs,
      content: (ref) => readValue(labelContent, ref),
      metrics: readLabelMetrics,
      placement: readLabelPlacement,
      render: readLabelRender
    },
    bounds,
    box: (edgeId) => readEdgeBox(
      readValue(bounds, edgeId),
      readValue(item, edgeId)?.edge
    ),
    capability: (edge) => resolveEdgeCapability(edge, readNodeLocked),
    selectedChrome,
    related: read.edge.related,
    idsInRect: read.edge.idsInRect,
    connectCandidates
  }
}
