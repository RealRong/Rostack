import type {
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
} from '../types'
import {
  pickNearest,
  rectFromPoint,
  resolveScreenDistanceWorld
} from '../snap'
import type {
  EdgeConnectCandidate,
  EdgeConnectConfig,
  EdgeConnectResult
} from '../types/edge'
import { getAnchorFromPoint } from './anchor'

type ScoredConnectTarget = EdgeConnectResult & {
  distance: number
}

const readNodeRotation = (
  node: Node
) => (
  node.type === 'group'
    ? 0
    : (typeof node.rotation === 'number' ? node.rotation : 0)
)

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
  config.anchorSnapMin,
  zoom,
  zoomEpsilon
)

export const resolveEdgeConnectThresholdWorld = (
  config: EdgeConnectConfig,
  zoom: number,
  rect: Pick<Rect, 'width' | 'height'>
) => Math.max(
  resolveAnchorSnapMinWorld(config, zoom),
  Math.min(rect.width, rect.height) * config.anchorSnapRatio
)

export const resolveEdgeConnectQueryRect = (
  pointWorld: Point,
  zoom: number,
  config: EdgeConnectConfig,
  nodeSize: Size
) => rectFromPoint(
  pointWorld,
  resolveEdgeConnectThresholdWorld(config, zoom, nodeSize)
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
  snapRatio: config.anchorSnapRatio,
  anchorOffset
})

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

export type EdgeDraftEnd =
  | {
      kind: 'node'
      nodeId: NodeId
      anchor: EdgeAnchor
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
  line?: {
    from: Point
    to: Point
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
    anchor: EdgeAnchor
    pointWorld: Point
  }
): EdgeDraftEnd => (
  target
    ? {
        kind: 'node',
        nodeId: target.nodeId,
        anchor: target.anchor,
        point: target.pointWorld
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
  from,
  to
}: {
  pointerId: number
  edgeType: EdgeType
  from: EdgeDraftEnd
  to: EdgeDraftEnd
}): EdgeConnectState => ({
  kind: 'create',
  pointerId,
  edgeType,
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
      type: state.edgeType
    }
  }
}

export const resolveEdgeConnectPreview = (
  state: EdgeConnectState
): EdgeConnectPreview | undefined => {
  const line =
    state.kind === 'create' && state.to
      ? {
          from: state.from.point,
          to: state.to.point
        }
      : undefined
  const snap =
    state.to?.kind === 'node'
      ? state.to.point
      : undefined
  const patch = toEdgeConnectPatch(state)

  if (!line && !snap && !patch) {
    return undefined
  }

  return {
    line,
    snap,
    patch
  }
}
