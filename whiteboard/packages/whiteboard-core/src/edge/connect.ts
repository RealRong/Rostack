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
  Rect,
  Size
} from '@whiteboard/core/types'
import {
  pickNearest,
  rectFromPoint,
  resolveScreenDistanceWorld
} from '@whiteboard/core/snap'
import type {
  EdgeConnectCandidate,
  EdgeConnectConfig,
  EdgeConnectEvaluation,
  EdgeConnectResult
} from '@whiteboard/core/types/edge'
import { getAnchorFromPoint } from '@whiteboard/core/edge/anchor'
import {
  getNodeAnchor,
  projectPointToNodeOutline
} from '@whiteboard/core/node/outline'
import { readNodeRotation } from '@whiteboard/core/node'

type ScoredConnectTarget = EdgeConnectResult & {
  distance: number
}

export const DEFAULT_EDGE_ANCHOR_OFFSET = 0.5

const distanceToRect = (
  rect: Rect,
  point: Point
) => {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

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
  config: EdgeConnectConfig,
  nodeSize: Size
) => rectFromPoint(
  pointWorld,
  Math.max(
    resolveEdgeConnectThresholdWorld(config, zoom, nodeSize),
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
  const rotation = readNodeRotation(candidate.node)
  const threshold = resolveEdgeHandleSnapWorld(config, zoom)
  let best: HandleConnectTarget | undefined

  for (let index = 0; index < CONNECT_HANDLE_SIDES.length; index += 1) {
    const side = CONNECT_HANDLE_SIDES[index]!
    const anchor: EdgeAnchor = {
      side,
      offset: DEFAULT_EDGE_ANCHOR_OFFSET
    }
    const point = getNodeAnchor(
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
  const rotation = readNodeRotation(candidate.node)
  const projected = projectPointToNodeOutline(
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
    const distance = distanceToRect(candidate.geometry.bounds, pointWorld)

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

    if (distanceToRect(candidate.geometry.bounds, pointWorld) > threshold) {
      continue
    }

    const resolved = resolveAnchorFromPoint({
      node: candidate.node,
      rect: candidate.geometry.rect,
      rotation: readNodeRotation(candidate.node),
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

    if (distanceToRect(candidate.geometry.bounds, pointWorld) > coarseThreshold) {
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
