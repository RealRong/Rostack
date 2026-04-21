import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { edge as edgeApi,
  type EdgeConnectCandidate,
  type EdgeLabelMaskRect,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import type { SelectionTarget } from '@whiteboard/core/selection'
import { collection, equal, store } from '@shared/core'
import type { Edge, EdgeId, NodeId, NodeModel, Point, Rect, Size } from '@whiteboard/core/types'
import type {
  EdgeItem,
  EngineRead
} from '@whiteboard/engine'
import type {
  EdgePreviewProjection
} from '@whiteboard/editor/session/preview/types'
import type { EditorInputState } from '@whiteboard/editor/session/interaction'
import {
  toProjectedNodeGeometry,
  toSpatialNode,
  type NodePresentationRead,
  type ProjectedNode
} from '@whiteboard/editor/query/node/read'
import type { EditCaret, EditSession } from '@whiteboard/editor/session/edit'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { TextMetricsResource, TextMetricsSpec } from '@whiteboard/editor/types/layout'
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
  metricsSpec: TextMetricsSpec
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
  item: store.KeyedReadStore<EdgeId, EdgeItem | undefined>
  geometry: store.KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  render: store.KeyedReadStore<EdgeId, EdgeRender | undefined>
  label: {
    list: (edgeId: EdgeId) => readonly EdgeLabelRef[]
    content: (ref: EdgeLabelRef) => EdgeLabelContent | undefined
    metrics: (ref: EdgeLabelRef) => Size | undefined
    placement: (ref: EdgeLabelRef) => EdgeLabelPlacement | undefined
    render: (ref: EdgeLabelRef) => EdgeLabelRender | undefined
  }
  bounds: store.KeyedReadStore<EdgeId, Rect | undefined>
  box: (edgeId: EdgeId) => EdgeBox | undefined
  capability: (edge: EdgeItem['edge']) => EdgeCapability
  selectedChrome: store.ReadStore<SelectedEdgeChrome | undefined>
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

const EDGE_LABEL_PLACEHOLDER = 'Label'
const EDGE_LABEL_DEFAULT_FONT_SIZE = 14
const EDGE_LABEL_MASK_BLEED = 4

const EDGE_CAPABILITY_BASE = {
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true,
  editLabel: true
} as const

const readEdgeLabelDisplayText = (
  value: string,
  editing: boolean
) => value || (editing ? EDGE_LABEL_PLACEHOLDER : '')

const buildEdgeLabelTextMetricsSpec = ({
  text,
  style
}: {
  text: string | undefined
  style: NonNullable<Edge['labels']>[number]['style']
}): TextMetricsSpec => ({
  profile: 'edge-label',
  text: text ?? '',
  placeholder: EDGE_LABEL_PLACEHOLDER,
  fontSize: style?.size ?? EDGE_LABEL_DEFAULT_FONT_SIZE,
  fontWeight: style?.weight ?? 400,
  fontStyle: style?.italic
    ? 'italic'
    : 'normal'
})

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
    && edgeApi.equal.anchor(left.ends.source.anchor, right.ends.source.anchor)
    && edgeApi.equal.anchor(left.ends.target.anchor, right.ends.target.anchor)
    && geometryApi.equal.point(left.ends.source.point, right.ends.source.point)
    && geometryApi.equal.point(left.ends.target.point, right.ends.target.point)
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
    && geometryApi.equal.point(left.from, right.from)
    && geometryApi.equal.point(left.to, right.to)
    && geometryApi.equal.point(left.insertPoint, right.insertPoint)
    && equal.samePointArray(left.hitPoints, right.hitPoints)
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
  if (!geometryApi.equal.point(left.point, right.point)) {
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
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
    && left.path.svgPath === right.path.svgPath
    && equal.samePointArray(left.path.points, right.path.points)
    && geometryApi.equal.point(left.path.label, right.path.label)
    && equal.sameOrder(
      left.path.segments,
      right.path.segments,
      isEdgePathSegmentEqual
    )
    && equal.sameOrder(
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
  && geometryApi.equal.point(left.center, right.center)
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
    && geometryApi.equal.point(left.point, right.point)
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
    && left.metricsSpec.profile === right.metricsSpec.profile
    && left.metricsSpec.text === right.metricsSpec.text
    && left.metricsSpec.placeholder === right.metricsSpec.placeholder
    && left.metricsSpec.fontSize === right.metricsSpec.fontSize
    && left.metricsSpec.fontWeight === right.metricsSpec.fontWeight
    && left.metricsSpec.fontStyle === right.metricsSpec.fontStyle
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
    && equal.sameRect(left.box.rect, right.box.rect)
    && isEdgeGeometryEqual(left, right)
    && equal.sameOrder(left.labels, right.labels, isEdgeLabelRenderEqual)
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
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
    && equal.sameOrder(
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
  readNode: Pick<NodePresentationRead, 'projected'>,
  edgeEnd: EdgeItem['edge']['source'] | EdgeItem['edge']['target']
): {
  node: ReturnType<typeof toSpatialNode>
  geometry: ReturnType<typeof toProjectedNodeGeometry>
} | undefined => {
  if (edgeEnd.kind !== 'node') {
    return undefined
  }

  const projected = store.read(readNode.projected, edgeEnd.nodeId)
  return projected
    ? {
        node: toSpatialNode(projected),
        geometry: toProjectedNodeGeometry(projected)
      }
    : undefined
}

const readEdgeGeometry = (
  node: Pick<NodePresentationRead, 'projected'>,
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
    return edgeApi.view.resolve({
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
  node: Pick<NodePresentationRead, 'projected' | 'idsInRect'>
  feedback: store.KeyedReadStore<EdgeId, EdgePreviewProjection>
  edit: {
    session: store.ReadStore<EditSession>
    edgeLabel: store.KeyedReadStore<EdgeId, EdgeLabelEditView | undefined>
  }
  selection: {
    target: store.ReadStore<SelectionTarget>
    selected: store.KeyedReadStore<EdgeId, boolean>
  }
  tool: store.ReadStore<Tool>
  interaction: Pick<EditorInputState, 'mode' | 'chrome'>
  textMetrics: Pick<TextMetricsResource, 'measure'>
  capability: (node: Pick<NodeModel, 'id' | 'type' | 'owner'>) => {
    connect: boolean
  }
}): EdgePresentationRead => {
  const item: EdgePresentationRead['item'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = store.read(read.edge.item, edgeId)
      if (!entry) {
        return undefined
      }

      const nextEdge = edgeApi.patch.apply(entry.edge, store.read(feedback, edgeId).patch)
      return nextEdge === entry.edge
        ? entry
        : {
            ...entry,
            edge: nextEdge
          }
    },
    isEqual: isEdgeItemEqual
  })

  const geometry: EdgePresentationRead['geometry'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = store.read(item, edgeId)
      return entry
        ? readEdgeGeometry(node, entry)
        : undefined
    },
    isEqual: isEdgeGeometryEqual
  })

  const labelContent = store.createKeyedDerivedStore<EdgeLabelRef, EdgeLabelContent | undefined>({
    keyOf: readEdgeLabelRefKey,
    get: (ref) => {
      const currentItem = store.read(item, ref.edgeId)
      const label = currentItem?.edge.labels?.find((entry) => entry.id === ref.labelId)
      if (!currentItem || !label) {
        return undefined
      }

      const currentEdit = store.read(edit.edgeLabel, ref.edgeId)
      const editing = currentEdit?.labelId === ref.labelId
      const text = editing
        ? currentEdit.text
        : label.text ?? ''
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
        metricsSpec: buildEdgeLabelTextMetricsSpec({
          text,
          style: label.style
        })
      }
    },
    isEqual: isEdgeLabelContentEqual
  })

  const bounds: EdgePresentationRead['bounds'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentGeometry = store.read(geometry, edgeId)
      return currentGeometry
        ? edgeApi.path.bounds(currentGeometry.path)
        : undefined
    },
    isEqual: equal.sameOptionalRect
  })

  const readLabelRefs = (
    edgeId: EdgeId
  ): readonly EdgeLabelRef[] => store.read(item, edgeId)?.edge.labels?.map((label) => ({
      edgeId,
      labelId: label.id
    })) ?? []

  const readLabelMetrics = (
    ref: EdgeLabelRef
  ): Size | undefined => {
    const currentContent = store.read(labelContent, ref)
    if (!currentContent) {
      return undefined
    }

    const measuredSize = textMetrics.measure(currentContent.metricsSpec)
    return edgeApi.label.placementSize({
      textMode: currentContent.textMode,
      measuredSize,
      text: currentContent.displayText,
      fontSize: currentContent.metricsSpec.fontSize
    })
  }

  const readLabelPlacement = (
    ref: EdgeLabelRef
  ): EdgeLabelPlacement | undefined => {
    const currentGeometry = store.read(geometry, ref.edgeId)
    const currentContent = store.read(labelContent, ref)
    const currentSize = readLabelMetrics(ref)
    if (!currentGeometry || !currentContent || !currentSize) {
      return undefined
    }

    const placement = edgeApi.label.placement({
      path: currentGeometry.path,
      t: currentContent.t,
      offset: currentContent.offset,
      textMode: currentContent.textMode,
      labelSize: currentSize,
      sideGap: edgeApi.label.sideGap(currentContent.textMode)
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
      maskRect: edgeApi.label.mask({
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
    const currentContent = store.read(labelContent, ref)
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

  const render: EdgePresentationRead['render'] = store.createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const currentItem = store.read(item, edgeId)
      const currentGeometry = store.read(geometry, edgeId)
      const currentBox = readEdgeBox(
        store.read(bounds, edgeId),
        currentItem?.edge
      )
      if (!currentItem || !currentGeometry || !currentBox) {
        return undefined
      }

      const runtime = readEdgeRuntime({
        feedback: store.read(feedback, edgeId),
        selected: store.read(selection.selected, edgeId)
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
      const projected = store.read(node.projected, nodeIds[index])
      if (!projected || !capability(projected.node).connect) {
        continue
      }

      candidates.push({
        nodeId: projected.node.id,
        node: toSpatialNode(projected),
        geometry: toProjectedNodeGeometry(projected)
      })
    }

    return candidates
  }

  const readNodeLocked = (
    nodeId: NodeId
  ) => Boolean(store.read(node.projected, nodeId)?.node.locked)

  const selectedChrome: EdgePresentationRead['selectedChrome'] = store.createDerivedStore({
    get: () => {
      const selectedEdgeId = readSelectedEdgeId(store.read(selection.target))
      if (!selectedEdgeId) {
        return undefined
      }

      const currentItem = store.read(item, selectedEdgeId)
      const currentGeometry = store.read(geometry, selectedEdgeId)
      if (!currentItem || !currentGeometry) {
        return undefined
      }

      const currentCapability = resolveEdgeCapability(currentItem.edge, readNodeLocked)
      const currentEdit = store.read(edit.session)
      const interactionMode = store.read(interaction.mode)
      const currentRuntime = readEdgeRuntime({
        feedback: store.read(feedback, selectedEdgeId),
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
          store.read(tool).type === 'select'
          && store.read(interaction.chrome)
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
    edges: (edgeIds) => collection.presentValues(edgeIds, (edgeId) => store.read(item, edgeId)?.edge),
    render,
    label: {
      list: readLabelRefs,
      content: (ref) => store.read(labelContent, ref),
      metrics: readLabelMetrics,
      placement: readLabelPlacement,
      render: readLabelRender
    },
    bounds,
    box: (edgeId) => readEdgeBox(
      store.read(bounds, edgeId),
      store.read(item, edgeId)?.edge
    ),
    capability: (edge) => resolveEdgeCapability(edge, readNodeLocked),
    selectedChrome,
    related: read.edge.related,
    idsInRect: read.edge.idsInRect,
    connectCandidates
  }
}
