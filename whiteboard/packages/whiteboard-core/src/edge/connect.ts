import type {
  ConnectResolution,
  Edge,
  EdgeAnchor,
  EdgeEnd,
  EdgeId,
  EdgeInput,
  EdgePatch,
  EdgeType,
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import { pickNearest } from '@whiteboard/core/geometry/scalar'
import {
  distancePointToRect,
  rectFromPoint
} from '@whiteboard/core/geometry/rect'
import { resolveScreenDistanceWorld } from '@whiteboard/core/geometry/viewport'
import type {
  EdgeConnectCandidate,
  EdgeConnectConfig,
  EdgeConnectEvaluation,
  EdgeConnectResult,
  ResolvedEdgeEnds
} from '@whiteboard/core/types/edge'
import { getAnchorFromPoint } from '@whiteboard/core/edge/anchor'
import { resolveEdgeViewFromNodeGeometry, type EdgeNodeGeometryInput } from '@whiteboard/core/edge/view'
import { quantizePointToOctilinear } from '@whiteboard/core/geometry/point'
import { node as nodeApi } from '@whiteboard/core/node'

type ScoredConnectTarget = EdgeConnectResult & {
  distance: number
}

export const DEFAULT_EDGE_ANCHOR_OFFSET = 0.5

export const resolveAnchorSnapMinWorld = (
  config: EdgeConnectConfig,
  zoom: number,
  zoomEpsilon = 0.0001
) => resolveScreenDistanceWorld(
  config.outlineSnapMin,
  zoom,
  zoomEpsilon
)

export const resolveEdgeConnectThresholdWorld = (
  config: EdgeConnectConfig,
  zoom: number,
  rect: Pick<Rect, 'width' | 'height'>
) => Math.max(
  resolveAnchorSnapMinWorld(config, zoom),
  Math.min(rect.width, rect.height) * config.outlineSnapRatio
)

export const resolveEdgeHandleSnapWorld = (
  config: EdgeConnectConfig,
  zoom: number,
  zoomEpsilon = 0.0001
) => resolveScreenDistanceWorld(
  config.handleSnapScreen,
  zoom,
  zoomEpsilon
)

export const resolveEdgeActivationPaddingWorld = (
  config: EdgeConnectConfig,
  zoom: number,
  zoomEpsilon = 0.0001
) => resolveScreenDistanceWorld(
  config.activationPaddingScreen,
  zoom,
  zoomEpsilon
)

export const resolveEdgeConnectQueryRect = (
  pointWorld: Point,
  zoom: number,
  config: EdgeConnectConfig
) => rectFromPoint(
  pointWorld,
  Math.max(
    resolveScreenDistanceWorld(
      config.connectQueryRadius,
      zoom
    ),
    resolveEdgeHandleSnapWorld(config, zoom),
    resolveEdgeActivationPaddingWorld(config, zoom)
  )
)

export const resolveAnchorFromPoint = ({
  node,
  rect,
  rotation,
  pointWorld,
  zoom,
  config,
  anchorOffset = DEFAULT_EDGE_ANCHOR_OFFSET
}: {
  node: Pick<Node, 'type' | 'data'>
  rect: Rect
  rotation: number
  pointWorld: Point
  zoom: number
  config: EdgeConnectConfig
  anchorOffset?: number
}) => getAnchorFromPoint(node, rect, rotation, pointWorld, {
  snapMin: resolveAnchorSnapMinWorld(config, zoom),
  snapRatio: config.outlineSnapRatio,
  anchorOffset
})

const CONNECT_HANDLE_SIDES = ['top', 'right', 'bottom', 'left'] as const

type HandleConnectTarget = {
  nodeId: NodeId
  side: EdgeAnchor['side']
  pointWorld: Point
  anchor: EdgeAnchor
  distance: number
}

type OutlineConnectTarget = {
  nodeId: NodeId
  pointWorld: Point
  anchor: EdgeAnchor
  distance: number
}

const resolveHandleConnectTarget = ({
  candidate,
  pointWorld,
  zoom,
  config
}: {
  candidate: EdgeConnectCandidate
  pointWorld: Point
  zoom: number
  config: EdgeConnectConfig
}): HandleConnectTarget | undefined => {
  const rotation = nodeApi.geometry.rotation(candidate.node)
  const threshold = resolveEdgeHandleSnapWorld(config, zoom)
  let best: HandleConnectTarget | undefined

  for (let index = 0; index < CONNECT_HANDLE_SIDES.length; index += 1) {
    const side = CONNECT_HANDLE_SIDES[index]!
    const anchor: EdgeAnchor = {
      side,
      offset: DEFAULT_EDGE_ANCHOR_OFFSET
    }
    const point = nodeApi.outline.anchor(
      candidate.node,
      candidate.geometry.rect,
      anchor,
      rotation,
      DEFAULT_EDGE_ANCHOR_OFFSET
    )
    const distance = Math.hypot(
      point.x - pointWorld.x,
      point.y - pointWorld.y
    )

    if (distance > threshold) {
      continue
    }

    if (!best || distance < best.distance) {
      best = {
        nodeId: candidate.nodeId,
        side,
        pointWorld: point,
        anchor,
        distance
      }
    }
  }

  return best
}

const resolveOutlineConnectTarget = ({
  candidate,
  pointWorld,
  zoom,
  config
}: {
  candidate: EdgeConnectCandidate
  pointWorld: Point
  zoom: number
  config: EdgeConnectConfig
}): OutlineConnectTarget | undefined => {
  const rotation = nodeApi.geometry.rotation(candidate.node)
  const projected = nodeApi.outline.projectPoint(
    candidate.node,
    candidate.geometry.rect,
    rotation,
    pointWorld
  )
  const threshold = resolveEdgeConnectThresholdWorld(
    config,
    zoom,
    candidate.geometry.rect
  )

  if (projected.distance > threshold) {
    return undefined
  }

  return {
    nodeId: candidate.nodeId,
    pointWorld: projected.point,
    anchor: projected.anchor,
    distance: projected.distance
  }
}

type FocusedConnectTarget = {
  nodeId: NodeId
  distance: number
}

const resolveFocusedConnectTarget = ({
  pointWorld,
  candidates,
  zoom,
  config
}: {
  pointWorld: Point
  candidates: readonly EdgeConnectCandidate[]
  zoom: number
  config: EdgeConnectConfig
}): FocusedConnectTarget | undefined => {
  const scored: FocusedConnectTarget[] = []

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!
    const threshold = Math.max(
      resolveEdgeActivationPaddingWorld(config, zoom),
      resolveEdgeConnectThresholdWorld(config, zoom, candidate.geometry.rect),
      resolveEdgeHandleSnapWorld(config, zoom)
    )
    const distance = distancePointToRect(pointWorld, candidate.geometry.bounds)

    if (distance > threshold) {
      continue
    }

    scored.push({
      nodeId: candidate.nodeId,
      distance
    })
  }

  return pickNearest(scored, (item) => item.distance)
}

export const resolveEdgeConnectTarget = ({
  pointWorld,
  candidates,
  zoom,
  config,
  anchorOffset = DEFAULT_EDGE_ANCHOR_OFFSET
}: {
  pointWorld: Point
  candidates: readonly EdgeConnectCandidate[]
  zoom: number
  config: EdgeConnectConfig
  anchorOffset?: number
}): EdgeConnectResult | undefined => {
  const scored: ScoredConnectTarget[] = []

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const threshold = resolveEdgeConnectThresholdWorld(
      config,
      zoom,
      candidate.geometry.rect
    )

    if (distancePointToRect(pointWorld, candidate.geometry.bounds) > threshold) {
      continue
    }

    const resolved = resolveAnchorFromPoint({
      node: candidate.node,
      rect: candidate.geometry.rect,
      rotation: nodeApi.geometry.rotation(candidate.node),
      pointWorld,
      zoom,
      config,
      anchorOffset
    })
    const distance = Math.hypot(
      resolved.point.x - pointWorld.x,
      resolved.point.y - pointWorld.y
    )
    if (distance > threshold) {
      continue
    }

    scored.push({
      nodeId: candidate.nodeId,
      anchor: resolved.anchor,
      pointWorld: resolved.point,
      distance
    })
  }

  const best = pickNearest(scored, (item) => item.distance)
  if (!best) {
    return undefined
  }

  return {
    nodeId: best.nodeId,
    anchor: best.anchor,
    pointWorld: best.pointWorld
  }
}

export const resolveEdgeConnectEvaluation = ({
  pointWorld,
  candidates,
  zoom,
  config
}: {
  pointWorld: Point
  candidates: readonly EdgeConnectCandidate[]
  zoom: number
  config: EdgeConnectConfig
}): EdgeConnectEvaluation => {
  const focused = resolveFocusedConnectTarget({
    pointWorld,
    candidates,
    zoom,
    config
  })

  const handles: HandleConnectTarget[] = []
  const outlines: OutlineConnectTarget[] = []

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!
    const coarseThreshold = Math.max(
      resolveEdgeActivationPaddingWorld(config, zoom),
      resolveEdgeConnectThresholdWorld(config, zoom, candidate.geometry.rect),
      resolveEdgeHandleSnapWorld(config, zoom)
    )

    if (distancePointToRect(pointWorld, candidate.geometry.bounds) > coarseThreshold) {
      continue
    }

    const handle = resolveHandleConnectTarget({
      candidate,
      pointWorld,
      zoom,
      config
    })
    if (handle) {
      handles.push(handle)
    }

    const outline = resolveOutlineConnectTarget({
      candidate,
      pointWorld,
      zoom,
      config
    })
    if (outline) {
      outlines.push(outline)
    }
  }

  const handle = pickNearest(handles, (item) => item.distance)
  if (handle) {
    return {
      focusedNodeId: focused?.nodeId ?? handle.nodeId,
      resolution: {
        mode: 'handle',
        nodeId: handle.nodeId,
        pointWorld: handle.pointWorld,
        anchor: handle.anchor,
        side: handle.side
      }
    }
  }

  const outline = pickNearest(outlines, (item) => item.distance)
  if (outline) {
    return {
      focusedNodeId: focused?.nodeId ?? outline.nodeId,
      resolution: {
        mode: 'outline',
        nodeId: outline.nodeId,
        pointWorld: outline.pointWorld,
        anchor: outline.anchor
      }
    }
  }

  return {
    focusedNodeId: focused?.nodeId,
    resolution: {
      mode: 'free',
      pointWorld
    }
  }
}

export type EdgeDraftEnd =
  | {
      kind: 'node'
      nodeId: NodeId
      anchor?: EdgeAnchor
      point: Point
    }
  | {
      kind: 'point'
      point: Point
    }

type EdgeConnectBase = {
  pointerId: number
  from: EdgeDraftEnd
  to?: EdgeDraftEnd
}

export type EdgeConnectState =
  | (EdgeConnectBase & {
      kind: 'create'
      edgeType: EdgeType
      style?: Edge['style']
      textMode?: Edge['textMode']
    })
  | (EdgeConnectBase & {
      kind: 'reconnect'
      edgeId: EdgeId
      end: 'source' | 'target'
    })

export type EdgeConnectCommit =
  | {
      kind: 'create'
      input: EdgeInput
    }
  | {
      kind: 'reconnect'
      edgeId: EdgeId
      end: 'source' | 'target'
      target: EdgeEnd
    }

export type EdgeConnectPreview = {
  path?: {
    svgPath: string
    style?: Edge['style']
  }
  snap?: Point
  patch?: EdgePatch
}

export const toPointDraftEnd = (
  point: Point
): EdgeDraftEnd => ({
  kind: 'point',
  point
})

export const toEdgeDraftEnd = (
  pointWorld: Point,
  target?: {
    nodeId: NodeId
    anchor?: EdgeAnchor
    pointWorld: Point
  }
): EdgeDraftEnd => (
  target
    ? {
        kind: 'node',
        nodeId: target.nodeId,
        point: target.pointWorld,
        ...(target.anchor
          ? {
              anchor: target.anchor
            }
          : {})
      }
    : toPointDraftEnd(pointWorld)
)

export const toEdgeEnd = (
  value: EdgeDraftEnd
): EdgeEnd => (
  value.kind === 'node'
    ? {
        kind: 'node',
        nodeId: value.nodeId,
        anchor: value.anchor
      }
    : {
        kind: 'point',
        point: value.point
      }
)

export const startEdgeCreate = ({
  pointerId,
  edgeType,
  style,
  textMode,
  from,
  to
}: {
  pointerId: number
  edgeType: EdgeType
  style?: Edge['style']
  textMode?: Edge['textMode']
  from: EdgeDraftEnd
  to: EdgeDraftEnd
}): EdgeConnectState => ({
  kind: 'create',
  pointerId,
  edgeType,
  ...(style
    ? {
        style: {
          ...style
        }
      }
    : {}),
  ...(textMode
    ? {
        textMode
      }
    : {}),
  from,
  to
})

export const startEdgeReconnect = ({
  pointerId,
  edgeId,
  end,
  from
}: {
  pointerId: number
  edgeId: EdgeId
  end: 'source' | 'target'
  from: EdgeDraftEnd
}): EdgeConnectState => ({
  kind: 'reconnect',
  pointerId,
  edgeId,
  end,
  from
})

export const resolveReconnectDraftEnd = ({
  end,
  point,
  anchor,
  anchorOffset = DEFAULT_EDGE_ANCHOR_OFFSET
}: {
  end: EdgeEnd
  point: Point
  anchor?: EdgeAnchor
  anchorOffset?: number
}): EdgeDraftEnd => (
  end.kind === 'node'
    ? {
        kind: 'node',
        nodeId: end.nodeId,
        anchor: end.anchor ?? {
          side: anchor?.side ?? 'right',
          offset: anchor?.offset ?? anchorOffset
        },
        point
      }
    : {
        kind: 'point',
        point
      }
)

export const setEdgeConnectTarget = (
  state: EdgeConnectState,
  to: EdgeDraftEnd
): EdgeConnectState => ({
  ...state,
  to
})

export const projectEdgeConnectState = (input: {
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
}): EdgeConnectState => setEdgeConnectTarget(
  input.state,
  toEdgeDraftEnd(
    input.evaluation.resolution.pointWorld,
    input.evaluation.resolution.mode === 'free'
      ? undefined
      : {
          nodeId: input.evaluation.resolution.nodeId,
          anchor: input.evaluation.resolution.anchor,
          pointWorld: input.evaluation.resolution.pointWorld
        }
  )
)

export const toEdgeConnectPatch = (
  state: EdgeConnectState
): EdgePatch | undefined => {
  if (state.kind !== 'reconnect' || !state.to) {
    return undefined
  }

  return state.end === 'source'
    ? { source: toEdgeEnd(state.to) }
    : { target: toEdgeEnd(state.to) }
}

export const toEdgeConnectCommit = (
  state: EdgeConnectState
): EdgeConnectCommit | undefined => {
  if (!state.to) {
    return undefined
  }

  if (state.kind === 'reconnect') {
    return {
      kind: 'reconnect',
      edgeId: state.edgeId,
      end: state.end,
      target: toEdgeEnd(state.to)
    }
  }

  return {
    kind: 'create',
    input: {
      source: toEdgeEnd(state.from),
      target: toEdgeEnd(state.to),
      type: state.edgeType,
      ...(state.style
        ? {
            style: {
              ...state.style
            }
          }
        : {}),
      ...(state.textMode
        ? {
            textMode: state.textMode
          }
        : {})
    }
  }
}

const mergeEdgePatch = (
  base?: EdgePatch,
  patch?: EdgePatch
): EdgePatch | undefined => {
  if (!base) {
    return patch
  }
  if (!patch) {
    return base
  }

  return {
    ...base,
    ...patch
  }
}

const STRAIGHT_RECONNECT_PATCH: EdgePatch = {
  type: 'straight',
  points: undefined
}

const toPreviewEdgeEnd = (
  draft: EdgeConnectState['from']
): EdgeEnd => (
  draft.kind === 'node'
    ? {
        kind: 'node',
        nodeId: draft.nodeId,
        anchor: draft.anchor
      }
    : {
        kind: 'point',
        point: draft.point
      }
)

const createPreviewEdge = (
  state: EdgeConnectState
): Edge | undefined => {
  if (state.kind !== 'create' || !state.to) {
    return undefined
  }

  return {
    id: '__preview__',
    source: toPreviewEdgeEnd(state.from),
    target: toPreviewEdgeEnd(state.to),
    type: state.edgeType,
    style: state.style,
    textMode: state.textMode
  }
}

export const resolveEdgeCreatePreviewPath = (input: {
  state: EdgeConnectState
  readNodeGeometry: (nodeId: NodeId) => EdgeNodeGeometryInput | undefined
}): EdgeConnectPreview['path'] | undefined => {
  const edge = createPreviewEdge(input.state)
  if (!edge || input.state.kind !== 'create' || !input.state.to) {
    return undefined
  }

  const view = resolveEdgeViewFromNodeGeometry({
    edge,
    readNodeGeometry: input.readNodeGeometry
  })
  if (!view) {
    return undefined
  }

  return {
    svgPath: view.path.svgPath,
    style: edge.style
  }
}

export const resolveReconnectFixedPoint = (input: {
  state: EdgeConnectState
  ends?: ResolvedEdgeEnds
}): Point | undefined => {
  if (input.state.kind !== 'reconnect' || !input.ends) {
    return undefined
  }

  return input.state.end === 'source'
    ? input.ends.target.point
    : input.ends.source.point
}

export const resolveReconnectDraftPatch = (input: {
  state: EdgeConnectState
  current?: EdgePatch
  shift: boolean
  allowLatch: boolean
}): EdgePatch | undefined => (
  input.state.kind === 'reconnect'
  && input.allowLatch
  && input.shift
)
  ? mergeEdgePatch(input.current, STRAIGHT_RECONNECT_PATCH)
  : input.current

export const resolveReconnectWorld = (input: {
  state: EdgeConnectState
  world: Point
  fixedPoint?: Point
  shift: boolean
  draftPatch?: EdgePatch
}): Point => (
  input.state.kind === 'reconnect'
  && input.shift
  && input.draftPatch?.type === 'straight'
  && input.draftPatch.points === undefined
  && input.fixedPoint
)
  ? quantizePointToOctilinear({
      point: input.world,
      origin: input.fixedPoint
    })
  : input.world

export const toEdgeReconnectPatch = (input: {
  state: EdgeConnectState
  draftPatch?: EdgePatch
}): EdgePatch | undefined => input.state.kind === 'reconnect'
  ? mergeEdgePatch(
      toEdgeConnectPatch(input.state),
      input.draftPatch
    )
  : undefined

export const resolveEdgeConnectPreview = (
  state: EdgeConnectState,
  previewPath?: EdgeConnectPreview['path']
): EdgeConnectPreview | undefined => {
  const snap =
    state.to?.kind === 'node'
      ? state.to.point
      : undefined
  const patch = toEdgeConnectPatch(state)

  if (!previewPath && !snap && !patch) {
    return undefined
  }

  return {
    path: previewPath,
    snap,
    patch
  }
}
