import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
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
  SceneItemKey
} from '../../contracts/delta'
import {
  renderChange,
  sceneItemKey
} from '../../contracts/delta'
import type {
  Input,
  SessionInput
} from '../../contracts/editor'
import type {
  ChromeRenderView,
  EdgeActiveView,
  EdgeLabelKey,
  EdgeLabelView,
  EdgeMaskView,
  NodeRenderView,
  EdgeOverlayRoutePoint,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from '../../contracts/render'
import type { WorkingState } from '../../contracts/working'

const EMPTY_ENDPOINT_HANDLES: EdgeOverlayView['endpointHandles'] = []
const EMPTY_ROUTE_POINTS: readonly EdgeOverlayRoutePoint[] = []
const STATIC_CHUNK_SIZE = 256

const readItemByKey = (
  working: WorkingState,
  key: SceneItemKey
) => working.items.byId.get(key)

const forEachSceneItem = (
  working: WorkingState,
  visit: (item: WorkingState['items']['byId'] extends ReadonlyMap<any, infer TValue> ? TValue : never) => void
) => {
  working.items.ids.forEach((key) => {
    const item = readItemByKey(working, key)
    if (item) {
      visit(item)
    }
  })
}

const toEdgeIdFromSceneItemKey = (
  key: SceneItemKey
): EdgeId | undefined => {
  const entry = sceneItemKey.read(key)
  return entry.kind === 'edge'
    ? entry.id
    : undefined
}

const isNodeRenderViewEqual = (
  left: NodeRenderView,
  right: NodeRenderView
): boolean => (
  left.id === right.id
  && left.node === right.node
  && left.owner?.kind === right.owner?.kind
  && left.owner?.id === right.owner?.id
  && equal.sameRect(left.rect, right.rect)
  && equal.sameRect(left.bounds, right.bounds)
  && left.rotation === right.rotation
  && left.outline === right.outline
  && left.state.hidden === right.state.hidden
  && left.state.selected === right.state.selected
  && left.state.hovered === right.state.hovered
  && left.state.editing === right.state.editing
  && left.state.patched === right.state.patched
  && left.state.resizing === right.state.resizing
  && left.edit?.field === right.edit?.field
  && isEditCaretEqual(left.edit?.caret, right.edit?.caret)
)

const readEdgeLabelKey = (
  edgeId: EdgeId,
  labelId: string
): EdgeLabelKey => `${edgeId}:${labelId}`

const readHoveredEdgeId = (
  hover: Input['runtime']['interaction']['hover']
): EdgeId | undefined => hover.kind === 'edge'
  ? hover.edgeId
  : undefined

const readEditingEdgeId = (
  edit: SessionInput['edit']
): EdgeId | undefined => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readSelectedEdgeId = (
  selection: Input['runtime']['interaction']['selection']
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

const isChromeRenderViewEqual = (
  left: ChromeRenderView,
  right: ChromeRenderView
): boolean => (
  left.marquee?.match === right.marquee?.match
  && equal.sameOptionalRect(left.marquee?.worldRect, right.marquee?.worldRect)
  && left.guides === right.guides
  && left.draw === right.draw
  && left.mindmap === right.mindmap
  && isOverlayViewEqual(left.edge, right.edge)
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
  interaction: Input['runtime']['interaction']
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

const buildNodeRenderView = (input: {
  working: WorkingState
  nodeId: NodeId
}): NodeRenderView | undefined => {
  const graph = input.working.graph.nodes.get(input.nodeId)
  if (!graph) {
    return undefined
  }

  const state = input.working.ui.nodes.get(input.nodeId)

  return {
    id: input.nodeId,
    node: graph.base.node,
    owner: graph.base.owner,
    rect: graph.geometry.rect,
    bounds: graph.geometry.bounds,
    rotation: graph.geometry.rotation,
    outline: graph.geometry.outline,
    state: {
      hidden: state?.hidden ?? false,
      selected: state?.selected ?? false,
      hovered: state?.hovered ?? false,
      editing: state?.editing ?? false,
      patched: state?.patched ?? false,
      resizing: state?.resizing ?? false
    },
    edit: state?.edit
  }
}

const buildOverlayView = (input: {
  working: WorkingState
  current: Input
}): EdgeOverlayView => {
  const previewPath = input.current.runtime.session.preview.edgeGuide?.path
    ? {
        svgPath: input.current.runtime.session.preview.edgeGuide.path.svgPath,
        style: edgeApi.render.staticStyle(
          input.current.runtime.session.preview.edgeGuide.path.style
        )
      }
    : undefined
  const connect = input.current.runtime.session.preview.edgeGuide?.connect
  const snapPoint = connect
    && (
      connect.resolution.mode === 'outline'
      || connect.resolution.mode === 'handle'
    )
    ? connect.resolution.pointWorld
    : undefined

  const selectedEdgeId = readSelectedEdgeId(input.current.runtime.interaction.selection)
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
    input.current.runtime.session.edit?.kind === 'edge-label'
    && input.current.runtime.session.edit.edgeId === selectedEdgeId
  const showEditHandles =
    input.current.runtime.session.tool.type === 'select'
    && input.current.runtime.interaction.chrome
    && !input.current.runtime.interaction.editingEdge
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

const buildChromeRenderView = (input: {
  working: WorkingState
}): ChromeRenderView => ({
  marquee: input.working.ui.chrome.preview.marquee,
  guides: input.working.ui.chrome.preview.guides,
  draw: input.working.ui.chrome.preview.draw,
  mindmap: input.working.ui.chrome.preview.mindmap,
  edge: input.working.render.overlay
})

const readRenderableEdge = (
  working: WorkingState,
  edgeId: EdgeId
) => {
  const edge = working.graph.edges.get(edgeId)
  if (!edge?.route.svgPath) {
    return undefined
  }

  return edge
}

const readEdgeStaticStyleKey = (
  working: WorkingState,
  edgeId: EdgeId
): string | undefined => {
  const edge = readRenderableEdge(working, edgeId)
  return edge
    ? edgeApi.render.styleKey(edge.base.edge.style)
    : undefined
}

const readStaticStyleOrder = (
  working: WorkingState
): readonly string[] => {
  const order: string[] = []
  const seen = new Set<string>()

  forEachSceneItem(working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const styleKey = readEdgeStaticStyleKey(working, item.id)
    if (!styleKey || seen.has(styleKey)) {
      return
    }

    seen.add(styleKey)
    order.push(styleKey)
  })

  return order
}

const buildStaticBucket = (input: {
  working: WorkingState
  styleKey: string
}) => {
  let style: EdgeStaticView['style'] | undefined
  const paths: EdgeStaticView['paths'][number][] = []

  forEachSceneItem(input.working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const edge = readRenderableEdge(input.working, item.id)
    if (!edge) {
      return
    }

    const styleKey = edgeApi.render.styleKey(edge.base.edge.style)
    if (styleKey !== input.styleKey) {
      return
    }

    style ??= edgeApi.render.staticStyle(edge.base.edge.style)
    paths.push({
      id: item.id,
      svgPath: edge.route.svgPath!
    })
  })

  if (!style || paths.length === 0) {
    return undefined
  }

  const edgeIds = paths.map((path) => path.id)
  const staticIds: EdgeStaticId[] = []
  const staticIdByEdge = new Map<EdgeId, EdgeStaticId>()
  const byId = new Map<EdgeStaticId, EdgeStaticView>()

  for (let index = 0; index < paths.length; index += STATIC_CHUNK_SIZE) {
    const chunkPaths = paths.slice(index, index + STATIC_CHUNK_SIZE)
    const chunkIndex = Math.floor(index / STATIC_CHUNK_SIZE)
    const staticId = `${input.styleKey}:${chunkIndex}`

    staticIds.push(staticId)
    byId.set(staticId, {
      id: staticId,
      styleKey: input.styleKey,
      style,
      paths: chunkPaths
    })

    chunkPaths.forEach((path) => {
      staticIdByEdge.set(path.id, staticId)
    })
  }

  return {
    edgeIds,
    staticIds,
    staticIdByEdge,
    byId
  }
}

const buildStaticState = (
  working: WorkingState
) => {
  const styleKeyByEdge = new Map<EdgeId, string>()
  const edgeIdsByStyleKey = new Map<string, readonly EdgeId[]>()
  const staticIdByEdge = new Map<EdgeId, EdgeStaticId>()
  const staticIdsByStyleKey = new Map<string, readonly EdgeStaticId[]>()
  const byId = new Map<EdgeStaticId, EdgeStaticView>()
  const styleOrder = readStaticStyleOrder(working)
  const ids: EdgeStaticId[] = []

  styleOrder.forEach((styleKey) => {
    const bucket = buildStaticBucket({
      working,
      styleKey
    })
    if (!bucket) {
      return
    }

    bucket.edgeIds.forEach((edgeId) => {
      styleKeyByEdge.set(edgeId, styleKey)
    })
    edgeIdsByStyleKey.set(styleKey, bucket.edgeIds)
    staticIdsByStyleKey.set(styleKey, bucket.staticIds)
    bucket.staticIdByEdge.forEach((staticId, edgeId) => {
      staticIdByEdge.set(edgeId, staticId)
    })
    bucket.byId.forEach((view, staticId) => {
      byId.set(staticId, view)
    })
    ids.push(...bucket.staticIds)
  })

  return {
    ids,
    byId,
    styleKeyByEdge,
    edgeIdsByStyleKey,
    staticIdByEdge,
    staticIdsByStyleKey
  }
}

const buildEdgeLabels = (input: {
  working: WorkingState
  edgeId: EdgeId
}) => {
  const labels = new Map<EdgeLabelKey, EdgeLabelView>()
  const edge = input.working.graph.edges.get(input.edgeId)
  if (!edge || edge.route.labels.length === 0) {
    return {
      ids: [] as EdgeLabelKey[],
      byId: labels
    }
  }

  const edgeUi = input.working.ui.edges.get(input.edgeId)
  const ids: EdgeLabelKey[] = []

  edge.route.labels.forEach((label) => {
    const labelUi = edgeUi?.labels.get(label.labelId)
    const key = readEdgeLabelKey(input.edgeId, label.labelId)
    ids.push(key)
    labels.set(key, {
      key,
      edgeId: input.edgeId,
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

  return {
    ids,
    byId: labels
  }
}

const buildEdgeMask = (input: {
  working: WorkingState
  edgeId: EdgeId
}): EdgeMaskView | undefined => {
  const edge = input.working.graph.edges.get(input.edgeId)
  if (!edge || edge.route.labels.length === 0) {
    return undefined
  }

  return {
    edgeId: input.edgeId,
    rects: edge.route.labels.map((label) => label.maskRect)
  }
}

const buildLabelsAndMasksState = (
  working: WorkingState
) => {
  const labels = new Map<EdgeLabelKey, EdgeLabelView>()
  const labelIds: EdgeLabelKey[] = []
  const keysByEdge = new Map<EdgeId, readonly EdgeLabelKey[]>()
  const masks = new Map<EdgeId, EdgeMaskView>()
  const maskIds: EdgeId[] = []

  forEachSceneItem(working, (item) => {
    if (item.kind !== 'edge') {
      return
    }

    const edgeLabels = buildEdgeLabels({
      working,
      edgeId: item.id
    })
    if (edgeLabels.ids.length > 0) {
      keysByEdge.set(item.id, edgeLabels.ids)
      labelIds.push(...edgeLabels.ids)
      edgeLabels.byId.forEach((view, key) => {
        labels.set(key, view)
      })
    }

    const mask = buildEdgeMask({
      working,
      edgeId: item.id
    })
    if (!mask) {
      return
    }

    maskIds.push(item.id)
    masks.set(item.id, mask)
  })

  return {
    labels: {
      ids: labelIds,
      byId: labels,
      keysByEdge
    },
    masks: {
      ids: maskIds,
      byId: masks
    }
  }
}

const readActiveEdgeIds = (
  current: Input
): ReadonlySet<EdgeId> => new Set<EdgeId>([
  ...current.runtime.interaction.selection.edgeIds,
  ...(current.runtime.interaction.hover.kind === 'edge'
    ? [current.runtime.interaction.hover.edgeId]
    : []),
  ...(current.runtime.session.edit?.kind === 'edge-label'
    ? [current.runtime.session.edit.edgeId]
    : [])
])

const collectNodeRenderIds = (
  working: WorkingState
): ReadonlySet<NodeId> => idDelta.touchedMany(
  working.dirty.graph.node.lifecycle,
  working.dirty.graph.node.geometry,
  working.dirty.graph.node.content,
  working.dirty.graph.node.owner,
  working.delta.ui.node
)

const collectStaticsEdgeIds = (
  working: WorkingState
): ReadonlySet<EdgeId> => {
  const edgeIds = new Set<EdgeId>(idDelta.touchedMany(
    working.dirty.graph.edge.lifecycle,
    working.dirty.graph.edge.route,
    working.dirty.graph.edge.style
  ))
  working.delta.items.change?.set?.forEach((key) => {
    const edgeId = toEdgeIdFromSceneItemKey(key)
    if (edgeId) {
      edgeIds.add(edgeId)
    }
  })
  working.delta.items.change?.remove?.forEach((key) => {
    const edgeId = toEdgeIdFromSceneItemKey(key)
    if (edgeId) {
      edgeIds.add(edgeId)
    }
  })
  return edgeIds
}

const collectLabelEdgeIds = (
  working: WorkingState
): ReadonlySet<EdgeId> => {
  return idDelta.touchedMany(
    working.dirty.graph.edge.lifecycle,
    working.dirty.graph.edge.route,
    working.dirty.graph.edge.labels,
    working.delta.ui.edge
  )
}

const collectMaskEdgeIds = (
  working: WorkingState
): ReadonlySet<EdgeId> => idDelta.touchedMany(
  working.dirty.graph.edge.lifecycle,
  working.dirty.graph.edge.route,
  working.dirty.graph.edge.labels
)

const collectActiveEdgeIds = (input: {
  working: WorkingState
  current: Input
}): ReadonlySet<EdgeId> => new Set<EdgeId>([
  ...readActiveEdgeIds(input.current),
  ...input.working.render.active.keys(),
  ...input.working.dirty.graph.edge.lifecycle.added,
  ...input.working.dirty.graph.edge.lifecycle.updated,
  ...input.working.dirty.graph.edge.lifecycle.removed,
  ...input.working.dirty.graph.edge.route.added,
  ...input.working.dirty.graph.edge.route.updated,
  ...input.working.dirty.graph.edge.route.removed,
  ...input.working.dirty.graph.edge.style.added,
  ...input.working.dirty.graph.edge.style.updated,
  ...input.working.dirty.graph.edge.style.removed,
  ...input.working.dirty.graph.edge.box.added,
  ...input.working.dirty.graph.edge.box.updated,
  ...input.working.dirty.graph.edge.box.removed,
  ...input.working.delta.ui.edge.added,
  ...input.working.delta.ui.edge.updated,
  ...input.working.delta.ui.edge.removed
])

const writeNodeRenderDelta = (input: {
  working: WorkingState
  nodeId: NodeId
  previous: NodeRenderView | undefined
  next: NodeRenderView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.working.delta.render.node, input.nodeId)
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.working.delta.render.node, input.nodeId)
    return
  }

  idDelta.update(input.working.delta.render.node, input.nodeId)
}

const writeStaticDelta = (input: {
  working: WorkingState
  staticId: EdgeStaticId
  previous: EdgeStaticView | undefined
  next: EdgeStaticView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.working.delta.render.edge.statics, input.staticId)
    input.working.delta.render.edge.staticsIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.working.delta.render.edge.statics, input.staticId)
    input.working.delta.render.edge.staticsIds = true
    return
  }

  idDelta.update(input.working.delta.render.edge.statics, input.staticId)
}

const writeLabelDelta = (input: {
  working: WorkingState
  key: EdgeLabelKey
  previous: EdgeLabelView | undefined
  next: EdgeLabelView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.working.delta.render.edge.labels, input.key)
    input.working.delta.render.edge.labelsIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.working.delta.render.edge.labels, input.key)
    input.working.delta.render.edge.labelsIds = true
    return
  }

  idDelta.update(input.working.delta.render.edge.labels, input.key)
}

const writeMaskDelta = (input: {
  working: WorkingState
  edgeId: EdgeId
  previous: EdgeMaskView | undefined
  next: EdgeMaskView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.working.delta.render.edge.masks, input.edgeId)
    input.working.delta.render.edge.masksIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.working.delta.render.edge.masks, input.edgeId)
    input.working.delta.render.edge.masksIds = true
    return
  }

  idDelta.update(input.working.delta.render.edge.masks, input.edgeId)
}

const writeActiveDelta = (input: {
  working: WorkingState
  edgeId: EdgeId
  previous: EdgeActiveView | undefined
  next: EdgeActiveView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.working.delta.render.edge.active, input.edgeId)
    input.working.delta.render.edge.activeIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.working.delta.render.edge.active, input.edgeId)
    input.working.delta.render.edge.activeIds = true
    return
  }

  idDelta.update(input.working.delta.render.edge.active, input.edgeId)
}

const replaceIdSegment = <TId extends string>(
  ids: readonly TId[],
  previousIds: readonly TId[],
  nextIds: readonly TId[]
): readonly TId[] => {
  if (previousIds.length === 0) {
    return nextIds.length === 0
      ? ids
      : [...ids, ...nextIds]
  }

  const previousIdSet = new Set(previousIds)
  const startIndex = ids.findIndex((id) => id === previousIds[0])
  if (startIndex === -1) {
    return [
      ...ids.filter((id) => !previousIdSet.has(id)),
      ...nextIds
    ]
  }

  return [
    ...ids.slice(0, startIndex),
    ...nextIds,
    ...ids.slice(startIndex).filter((id) => !previousIdSet.has(id))
  ]
}

const patchStatics = (input: {
  working: WorkingState
  reset: boolean
  statics: boolean
}): number => {
  if (!input.reset && !input.statics) {
    return 0
  }

  const previous = input.working.render.statics
  if (input.reset) {
    const built = buildStaticState(input.working)
    const nextById = new Map<EdgeStaticId, EdgeStaticView>()
    let count = 0

    built.byId.forEach((view, staticId) => {
      const previousView = previous.byId.get(staticId)
      nextById.set(
        staticId,
        previousView && isStaticViewEqual(previousView, view)
          ? previousView
          : view
      )
    })

    new Set<EdgeStaticId>([
      ...previous.ids,
      ...built.ids
    ]).forEach((staticId) => {
      const previousView = previous.byId.get(staticId)
      const nextView = nextById.get(staticId)
      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isStaticViewEqual(previousView, nextView)
        )
      ) {
        writeStaticDelta({
          working: input.working,
          staticId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })

    if (!equal.sameOrder(previous.ids, built.ids, (left, right) => left === right)) {
      input.working.delta.render.edge.staticsIds = true
    }

    input.working.render.statics = {
      ids: built.ids,
      byId: nextById,
      styleKeyByEdge: built.styleKeyByEdge,
      edgeIdsByStyleKey: built.edgeIdsByStyleKey,
      staticIdByEdge: built.staticIdByEdge,
      staticIdsByStyleKey: built.staticIdsByStyleKey
    }
    return count
  }

  const touchedEdgeIds = collectStaticsEdgeIds(input.working)
  if (touchedEdgeIds.size === 0) {
    return 0
  }

  const touchedStyleKeys = new Set<string>()
  touchedEdgeIds.forEach((edgeId) => {
    const previousStyleKey = previous.styleKeyByEdge.get(edgeId)
    if (previousStyleKey) {
      touchedStyleKeys.add(previousStyleKey)
    }

    const nextStyleKey = readEdgeStaticStyleKey(input.working, edgeId)
    if (nextStyleKey) {
      touchedStyleKeys.add(nextStyleKey)
    }
  })

  if (touchedStyleKeys.size === 0) {
    return 0
  }

  const nextById = new Map(previous.byId)
  const nextStyleKeyByEdge = new Map(previous.styleKeyByEdge)
  const nextEdgeIdsByStyleKey = new Map(previous.edgeIdsByStyleKey)
  const nextStaticIdByEdge = new Map(previous.staticIdByEdge)
  const nextStaticIdsByStyleKey = new Map(previous.staticIdsByStyleKey)
  let count = 0

  touchedStyleKeys.forEach((styleKey) => {
    const previousStaticIds = previous.staticIdsByStyleKey.get(styleKey) ?? []
    const previousEdgeIds = previous.edgeIdsByStyleKey.get(styleKey) ?? []
    const nextBucket = buildStaticBucket({
      working: input.working,
      styleKey
    })

    previousEdgeIds.forEach((edgeId) => {
      nextStyleKeyByEdge.delete(edgeId)
      nextStaticIdByEdge.delete(edgeId)
    })

    if (!nextBucket) {
      nextEdgeIdsByStyleKey.delete(styleKey)
      nextStaticIdsByStyleKey.delete(styleKey)
    } else {
      nextEdgeIdsByStyleKey.set(styleKey, nextBucket.edgeIds)
      nextStaticIdsByStyleKey.set(styleKey, nextBucket.staticIds)
      nextBucket.edgeIds.forEach((edgeId) => {
        nextStyleKeyByEdge.set(edgeId, styleKey)
      })
      nextBucket.staticIdByEdge.forEach((staticId, edgeId) => {
        nextStaticIdByEdge.set(edgeId, staticId)
      })
    }

    new Set<EdgeStaticId>([
      ...previousStaticIds,
      ...(nextBucket?.staticIds ?? [])
    ]).forEach((staticId) => {
      const previousView = previous.byId.get(staticId)
      const nextCandidate = nextBucket?.byId.get(staticId)
      const nextView = previousView && nextCandidate && isStaticViewEqual(previousView, nextCandidate)
        ? previousView
        : nextCandidate

      if (nextView === undefined) {
        nextById.delete(staticId)
      } else {
        nextById.set(staticId, nextView)
      }

      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isStaticViewEqual(previousView, nextView)
        )
      ) {
        writeStaticDelta({
          working: input.working,
          staticId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })
  })

  const nextIds = readStaticStyleOrder(input.working).flatMap((styleKey) => (
    nextStaticIdsByStyleKey.get(styleKey) ?? []
  ))
  if (!equal.sameOrder(previous.ids, nextIds, (left, right) => left === right)) {
    input.working.delta.render.edge.staticsIds = true
  }

  input.working.render.statics = {
    ids: nextIds,
    byId: nextById,
    styleKeyByEdge: nextStyleKeyByEdge,
    edgeIdsByStyleKey: nextEdgeIdsByStyleKey,
    staticIdByEdge: nextStaticIdByEdge,
    staticIdsByStyleKey: nextStaticIdsByStyleKey
  }

  return count
}

const patchNodeRender = (input: {
  working: WorkingState
  reset: boolean
  node: boolean
}): number => {
  const previous = input.working.render.node
  let count = 0

  if (input.reset) {
    const next = new Map<NodeId, NodeRenderView>()

    input.working.graph.nodes.forEach((_view, nodeId) => {
      const current = buildNodeRenderView({
        working: input.working,
        nodeId
      })
      if (!current) {
        return
      }

      const previousView = previous.get(nodeId)
      const nextView = previousView && isNodeRenderViewEqual(previousView, current)
        ? previousView
        : current
      next.set(nodeId, nextView)
    })

    new Set<NodeId>([
      ...previous.keys(),
      ...next.keys()
    ]).forEach((nodeId) => {
      const previousView = previous.get(nodeId)
      const nextView = next.get(nodeId)
      if (
        previousView === undefined && nextView !== undefined
        || previousView !== undefined && nextView === undefined
        || (
          previousView !== undefined
          && nextView !== undefined
          && !isNodeRenderViewEqual(previousView, nextView)
        )
      ) {
        writeNodeRenderDelta({
          working: input.working,
          nodeId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })

    input.working.render.node = next
    return count
  }

  if (!input.node) {
    return 0
  }

  collectNodeRenderIds(input.working).forEach((nodeId) => {
    const previousView = previous.get(nodeId)
    const nextCandidate = buildNodeRenderView({
      working: input.working,
      nodeId
    })
    const nextView = previousView && nextCandidate && isNodeRenderViewEqual(previousView, nextCandidate)
      ? previousView
      : nextCandidate

    if (nextView === undefined) {
      previous.delete(nodeId)
    } else {
      previous.set(nodeId, nextView)
    }

    if (
      previousView === undefined && nextView !== undefined
      || previousView !== undefined && nextView === undefined
      || (
        previousView !== undefined
        && nextView !== undefined
        && !isNodeRenderViewEqual(previousView, nextView)
      )
    ) {
      writeNodeRenderDelta({
        working: input.working,
        nodeId,
        previous: previousView,
        next: nextView
      })
      count += 1
    }
  })

  return count
}

const patchLabelsAndMasks = (input: {
  working: WorkingState
  reset: boolean
  labels: boolean
  masks: boolean
}): number => {
  if (
    !input.reset
    && !input.labels
    && !input.masks
  ) {
    return 0
  }

  const previousLabels = input.working.render.labels
  const previousMasks = input.working.render.masks
  if (input.reset) {
    const built = buildLabelsAndMasksState(input.working)
    const nextLabelById = new Map<EdgeLabelKey, EdgeLabelView>()
    const nextMaskById = new Map<EdgeId, EdgeMaskView>()
    let count = 0

    built.labels.byId.forEach((view, key) => {
      const previous = previousLabels.byId.get(key)
      nextLabelById.set(
        key,
        previous && isLabelViewEqual(previous, view)
          ? previous
          : view
      )
    })
    built.masks.byId.forEach((view, edgeId) => {
      const previous = previousMasks.byId.get(edgeId)
      nextMaskById.set(
        edgeId,
        previous && isMaskViewEqual(previous, view)
          ? previous
          : view
      )
    })

    new Set<EdgeLabelKey>([
      ...previousLabels.ids,
      ...built.labels.ids
    ]).forEach((key) => {
      const previous = previousLabels.byId.get(key)
      const next = nextLabelById.get(key)
      if (
        previous === undefined && next !== undefined
        || previous !== undefined && next === undefined
        || (
          previous !== undefined
          && next !== undefined
          && !isLabelViewEqual(previous, next)
        )
      ) {
        writeLabelDelta({
          working: input.working,
          key,
          previous,
          next
        })
        count += 1
      }
    })

    new Set<EdgeId>([
      ...previousMasks.ids,
      ...built.masks.ids
    ]).forEach((edgeId) => {
      const previous = previousMasks.byId.get(edgeId)
      const next = nextMaskById.get(edgeId)
      if (
        previous === undefined && next !== undefined
        || previous !== undefined && next === undefined
        || (
          previous !== undefined
          && next !== undefined
          && !isMaskViewEqual(previous, next)
        )
      ) {
        writeMaskDelta({
          working: input.working,
          edgeId,
          previous,
          next
        })
        count += 1
      }
    })

    input.working.render.labels = {
      ids: built.labels.ids,
      byId: nextLabelById,
      keysByEdge: built.labels.keysByEdge
    }
    input.working.render.masks = {
      ids: built.masks.ids,
      byId: nextMaskById
    }
    return count
  }

  const touchedLabelEdgeIds = input.labels
    ? collectLabelEdgeIds(input.working)
    : new Set<EdgeId>()
  const touchedMaskEdgeIds = input.masks
    ? collectMaskEdgeIds(input.working)
    : new Set<EdgeId>()

  if (touchedLabelEdgeIds.size === 0 && touchedMaskEdgeIds.size === 0) {
    return 0
  }

  let nextLabelIds = previousLabels.ids
  let nextLabelById = previousLabels.byId
  let nextKeysByEdge = previousLabels.keysByEdge
  let nextMaskIds = previousMasks.ids
  let nextMaskById = previousMasks.byId
  let labelStateChanged = false
  let maskStateChanged = false
  let count = 0

  if (touchedLabelEdgeIds.size > 0) {
    const labelsById = new Map(previousLabels.byId)
    const keysByEdge = new Map(previousLabels.keysByEdge)
    let labelIds = previousLabels.ids

    touchedLabelEdgeIds.forEach((edgeId) => {
      const previousKeys = previousLabels.keysByEdge.get(edgeId) ?? []
      const nextLabels = buildEdgeLabels({
        working: input.working,
        edgeId
      })
      const previousKeySet = new Set(previousKeys)
      const nextKeySet = new Set(nextLabels.ids)
      const changedKeys: Array<{
        key: EdgeLabelKey
        previous: EdgeLabelView | undefined
        next: EdgeLabelView | undefined
      }> = []

      new Set<EdgeLabelKey>([
        ...previousKeys,
        ...nextLabels.ids
      ]).forEach((key) => {
        const previous = previousLabels.byId.get(key)
        const nextCandidate = nextLabels.byId.get(key)
        const next = previous && nextCandidate && isLabelViewEqual(previous, nextCandidate)
          ? previous
          : nextCandidate

        if (
          previous === undefined && next !== undefined
          || previous !== undefined && next === undefined
          || (
            previous !== undefined
            && next !== undefined
            && !isLabelViewEqual(previous, next)
          )
        ) {
          changedKeys.push({
            key,
            previous,
            next
          })
        }
      })

      if (changedKeys.length === 0) {
        return
      }

      labelStateChanged = true

      previousKeys.forEach((key) => {
        if (!nextLabels.byId.has(key)) {
          labelsById.delete(key)
        }
      })
      nextLabels.byId.forEach((view, key) => {
        const previous = previousLabels.byId.get(key)
        labelsById.set(
          key,
          previous && isLabelViewEqual(previous, view)
            ? previous
            : view
        )
      })

      if (nextLabels.ids.length === 0) {
        keysByEdge.delete(edgeId)
      } else {
        keysByEdge.set(edgeId, nextLabels.ids)
      }

      const membershipChanged =
        previousKeys.length !== nextLabels.ids.length
        || previousKeys.some((key) => !nextKeySet.has(key))
        || nextLabels.ids.some((key) => !previousKeySet.has(key))
      if (membershipChanged) {
        labelIds = replaceIdSegment(labelIds, previousKeys, nextLabels.ids)
      }

      changedKeys.forEach(({ key, previous, next }) => {
        writeLabelDelta({
          working: input.working,
          key,
          previous,
          next
        })
        count += 1
      })
    })

    if (labelStateChanged) {
      nextLabelIds = labelIds
      nextLabelById = labelsById
      nextKeysByEdge = keysByEdge
    }
  }

  if (touchedMaskEdgeIds.size > 0) {
    const masksById = new Map(previousMasks.byId)
    let maskIds = previousMasks.ids

    touchedMaskEdgeIds.forEach((edgeId) => {
      const previous = previousMasks.byId.get(edgeId)
      const nextCandidate = buildEdgeMask({
        working: input.working,
        edgeId
      })
      const next = previous && nextCandidate && isMaskViewEqual(previous, nextCandidate)
        ? previous
        : nextCandidate

      if (
        !(
          previous === undefined && next !== undefined
          || previous !== undefined && next === undefined
          || (
            previous !== undefined
            && next !== undefined
            && !isMaskViewEqual(previous, next)
          )
        )
      ) {
        return
      }

      maskStateChanged = true

      if (next === undefined) {
        masksById.delete(edgeId)
        maskIds = maskIds.filter((id) => id !== edgeId)
      } else {
        masksById.set(edgeId, next)
        if (previous === undefined) {
          maskIds = [...maskIds, edgeId]
        }
      }

      writeMaskDelta({
        working: input.working,
        edgeId,
        previous,
        next
      })
      count += 1
    })

    if (maskStateChanged) {
      nextMaskIds = maskIds
      nextMaskById = masksById
    }
  }

  if (labelStateChanged) {
    input.working.render.labels = {
      ids: nextLabelIds,
      byId: nextLabelById,
      keysByEdge: nextKeysByEdge
    }
  }

  if (maskStateChanged) {
    input.working.render.masks = {
      ids: nextMaskIds,
      byId: nextMaskById
    }
  }

  return count
}

const patchActive = (input: {
  working: WorkingState
  current: Input
  reset: boolean
  active: boolean
}): number => {
  const activeIds = readActiveEdgeIds(input.current)
  const previous = input.working.render.active
  let count = 0

  if (input.reset) {
    const next = new Map<EdgeId, EdgeActiveView>()

    activeIds.forEach((edgeId) => {
      const view = buildActiveView({
        working: input.working,
        interaction: input.current.runtime.interaction,
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
        writeActiveDelta({
          working: input.working,
          edgeId,
          previous: previousView,
          next: nextView
        })
        count += 1
      }
    })

    input.working.render.active = next
    return count
  }

  if (!input.active) {
    return 0
  }

  collectActiveEdgeIds({
    working: input.working,
    current: input.current
  }).forEach((edgeId) => {
    const previousView = previous.get(edgeId)
    const nextCandidate = activeIds.has(edgeId)
      ? buildActiveView({
          working: input.working,
          interaction: input.current.runtime.interaction,
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
      writeActiveDelta({
        working: input.working,
        edgeId,
        previous: previousView,
        next: nextView
      })
      count += 1
    }
  })

  return count
}

const patchOverlay = (input: {
  working: WorkingState
  current: Input
  reset: boolean
  overlay: boolean
}): number => {
  if (!input.reset && !input.overlay) {
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
  input.working.delta.render.chrome.edge = next !== previous
  return next !== previous ? 1 : 0
}

const patchChromeRender = (input: {
  working: WorkingState
  reset: boolean
  chrome: boolean
  overlay: boolean
}): number => {
  if (!input.reset && !input.chrome && !input.overlay) {
    return 0
  }

  const previous = input.working.render.chrome
  const nextCandidate = buildChromeRenderView({
    working: input.working
  })
  const next = isChromeRenderViewEqual(previous, nextCandidate)
    ? previous
    : nextCandidate

  input.working.render.chrome = next
  input.working.delta.render.chrome.scene = next !== previous
  return next !== previous ? 1 : 0
}

export const patchRenderState = (input: {
  working: WorkingState
  current: Input
  reset: boolean
}): number => {
  input.working.delta.render = renderChange.create()

  const scope = {
    reset: input.reset,
    node: (
      input.reset
      || idDelta.hasAnyOf(
        input.working.dirty.graph.node.lifecycle,
        input.working.dirty.graph.node.geometry,
        input.working.dirty.graph.node.content,
        input.working.dirty.graph.node.owner,
        input.working.delta.ui.node
      )
    ),
    statics: (
      input.reset
      || input.working.delta.items.change !== undefined
      || idDelta.hasAnyOf(
        input.working.dirty.graph.edge.lifecycle,
        input.working.dirty.graph.edge.route,
        input.working.dirty.graph.edge.style
      )
    ),
    active: (
      input.reset
      || idDelta.hasAnyOf(
        input.working.dirty.graph.edge.lifecycle,
        input.working.dirty.graph.edge.route,
        input.working.dirty.graph.edge.style,
        input.working.dirty.graph.edge.box,
        input.working.delta.ui.edge
      )
      || Boolean(
        input.current.runtime.delta.session.hover
        || input.current.runtime.delta.session.selection
        || input.current.runtime.delta.session.edit
      )
    ),
    labels: (
      input.reset
      || idDelta.hasAnyOf(
        input.working.dirty.graph.edge.lifecycle,
        input.working.dirty.graph.edge.route,
        input.working.dirty.graph.edge.labels,
        input.working.delta.ui.edge
      )
      || Boolean(
        input.current.runtime.delta.session.selection
        || input.current.runtime.delta.session.edit
      )
    ),
    masks: (
      input.reset
      || idDelta.hasAnyOf(
        input.working.dirty.graph.edge.lifecycle,
        input.working.dirty.graph.edge.route,
        input.working.dirty.graph.edge.labels
      )
    ),
    overlay: (
      input.reset
      || idDelta.hasAnyOf(
        input.working.dirty.graph.edge.route,
        input.working.dirty.graph.edge.endpoints,
        input.working.dirty.graph.edge.box
      )
      || Boolean(
        input.current.runtime.delta.session.tool
        || input.current.runtime.delta.session.interaction
        || input.current.runtime.delta.session.preview.edgeGuide
        || input.current.runtime.delta.session.selection
        || input.current.runtime.delta.session.hover
        || input.current.runtime.delta.session.edit
      )
    ),
    chrome: input.reset || input.working.delta.ui.chrome
  }

  if (
    !scope.reset
    && !scope.node
    && !scope.statics
    && !scope.active
    && !scope.labels
    && !scope.masks
    && !scope.overlay
    && !scope.chrome
  ) {
    return 0
  }

  return (
    patchNodeRender({
      working: input.working,
      reset: scope.reset,
      node: scope.node
    })
    + patchStatics({
      working: input.working,
      reset: scope.reset,
      statics: scope.statics
    })
    + patchLabelsAndMasks({
      working: input.working,
      reset: scope.reset,
      labels: scope.labels,
      masks: scope.masks
    })
    + patchActive({
      working: input.working,
      current: input.current,
      reset: scope.reset,
      active: scope.active
    })
    + patchOverlay({
      working: input.working,
      current: input.current,
      reset: scope.reset,
      overlay: scope.overlay
    })
    + patchChromeRender({
      working: input.working,
      reset: scope.reset,
      chrome: scope.chrome,
      overlay: scope.overlay
    })
  )
}
