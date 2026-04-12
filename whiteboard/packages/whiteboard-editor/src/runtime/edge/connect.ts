import {
  DEFAULT_EDGE_ANCHOR_OFFSET,
  type EdgeConnectEvaluation,
  type EdgeConnectPreview,
  resolveAnchorFromPoint,
  resolveEdgeView,
  resolveEdgeConnectPreview,
  resolveReconnectDraftEnd,
  setEdgeConnectTarget,
  startEdgeCreate,
  startEdgeReconnect,
  toEdgeConnectCommit,
  toEdgeDraftEnd,
  type EdgeConnectState
} from '@whiteboard/core/edge'
import { getNodeAnchor } from '@whiteboard/core/node'
import type { BoardConfig } from '@whiteboard/core/config'
import type {
  Edge,
  EdgeAnchor,
  EdgeEnd,
  EdgeId,
  EdgeType,
  NodeId
} from '@whiteboard/core/types'
import type { PointerDownInput } from '../../types/input'
import type { EdgePresetKey, Tool } from '../../types/tool'
import type { NodeCanvasSnapshot, NodeRead } from '../read/node'
import type { EdgeRead } from '../read/edge'
import type { EdgeGestureDraft } from '../interaction/gesture'

type ConnectNodeEntry = NonNullable<
  ReturnType<Pick<NodeRead, 'canvas'>['canvas']['get']>
>

const EDGE_PRESET_TYPE = {
  'edge.straight': 'straight',
  'edge.elbow': 'elbow',
  'edge.curve': 'curve'
} as const satisfies Record<EdgePresetKey, EdgeType>

const readNodeRotation = (
  entry: ConnectNodeEntry
) => (entry.node.rotation ?? 0)

const readEdgePresetType = (
  preset: EdgePresetKey
): EdgeType => EDGE_PRESET_TYPE[preset]

const readConnectNode = (
  node: Pick<NodeRead, 'canvas' | 'capability'>,
  nodeId: NodeId
): ConnectNodeEntry | undefined => {
  const entry = node.canvas.get(nodeId)
  if (!entry || !node.capability(entry.node).connect) {
    return undefined
  }

  return entry
}

const resolveCreateFromNode = (input: {
  node: Pick<NodeRead, 'canvas' | 'capability'>
  zoom: number
  config: BoardConfig['edge']
  pointer: PointerDownInput
  edgeType: EdgeType
}): EdgeConnectState | undefined => {
  const pick = input.pointer.pick
  if (pick.kind !== 'node') {
    return undefined
  }

  if (pick.part === 'connect' && pick.side) {
    const entry = readConnectNode(input.node, pick.id)
    if (!entry) {
      return undefined
    }

    const anchor: EdgeAnchor = {
      side: pick.side,
      offset: DEFAULT_EDGE_ANCHOR_OFFSET
    }

    return startEdgeCreate({
      pointerId: input.pointer.pointerId,
      edgeType: input.edgeType,
      from: {
        kind: 'node',
        nodeId: pick.id,
        anchor,
        point: getNodeAnchor(
          entry.node,
          entry.geometry.rect,
          anchor,
          readNodeRotation(entry)
        )
      },
      to: toEdgeDraftEnd(input.pointer.world)
    })
  }

  if (pick.part !== 'body') {
    return undefined
  }

  const entry = readConnectNode(input.node, pick.id)
  if (!entry) {
    return undefined
  }

  const resolved = resolveAnchorFromPoint({
    node: entry.node,
    rect: entry.geometry.rect,
    rotation: readNodeRotation(entry),
    pointWorld: input.pointer.world,
    zoom: input.zoom,
    config: input.config
  })

  return startEdgeCreate({
    pointerId: input.pointer.pointerId,
    edgeType: input.edgeType,
    from: {
      kind: 'node',
      nodeId: pick.id,
      anchor: resolved.anchor,
      point: resolved.point
    },
    to: toEdgeDraftEnd(input.pointer.world)
  })
}

const resolveReconnectState = (input: {
  edge: Pick<EdgeRead, 'item' | 'resolved' | 'capability'>
  edgeId: EdgeId
  end: 'source' | 'target'
  pointerId: number
}): EdgeConnectState | undefined => {
  const item = input.edge.item.get(input.edgeId)
  const resolved = input.edge.resolved.get(input.edgeId)
  if (!item || !resolved) {
    return undefined
  }

  const capability = input.edge.capability(item.edge)
  if (
    (input.end === 'source' && !capability.reconnectSource)
    || (input.end === 'target' && !capability.reconnectTarget)
  ) {
    return undefined
  }

  return startEdgeReconnect({
    pointerId: input.pointerId,
    edgeId: input.edgeId,
    end: input.end,
    from: resolveReconnectDraftEnd({
      end: item.edge[input.end],
      point: resolved.ends[input.end].point,
      anchor: resolved.ends[input.end].anchor,
      anchorOffset: DEFAULT_EDGE_ANCHOR_OFFSET
    })
  })
}

export const startEdgeConnect = (input: {
  tool: Tool
  pointer: PointerDownInput
  node: Pick<NodeRead, 'canvas' | 'capability'>
  edge: Pick<EdgeRead, 'item' | 'resolved' | 'capability'>
  zoom: number
  config: BoardConfig['edge']
}): EdgeConnectState | undefined => {
  if (input.tool.type === 'edge') {
    const canStartFromNodeHandle =
      input.pointer.pick.kind === 'node'
      && input.pointer.pick.part === 'connect'
      && Boolean(input.pointer.pick.side)

    if (
      !canStartFromNodeHandle
      && (
        input.pointer.editable
        || input.pointer.ignoreInput
        || input.pointer.ignoreSelection
      )
    ) {
      return undefined
    }

    return resolveCreateFromNode({
      node: input.node,
      zoom: input.zoom,
      config: input.config,
      pointer: input.pointer,
      edgeType: readEdgePresetType(input.tool.preset)
    }) ?? startEdgeCreate({
      pointerId: input.pointer.pointerId,
      edgeType: readEdgePresetType(input.tool.preset),
      from: toEdgeDraftEnd(input.pointer.world),
      to: toEdgeDraftEnd(input.pointer.world)
    })
  }

  if (
    input.tool.type !== 'select'
    || input.pointer.pick.kind !== 'edge'
    || input.pointer.pick.part !== 'end'
    || !input.pointer.pick.end
  ) {
    return undefined
  }

  return resolveReconnectState({
    edge: input.edge,
    edgeId: input.pointer.pick.id,
    end: input.pointer.pick.end,
    pointerId: input.pointer.pointerId
  })
}

export const createInitialEdgeConnectEvaluation = (
  state: EdgeConnectState
): EdgeConnectEvaluation => ({
  resolution: {
    mode: 'free',
    pointWorld: state.to?.point ?? state.from.point
  }
})

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

const readNodeSnapshot = (
  node: Pick<NodeRead, 'canvas'>,
  nodeId: NodeId
): NodeCanvasSnapshot | undefined => node.canvas.get(nodeId)

const resolveCreatePreviewPath = (
  node: Pick<NodeRead, 'canvas'>,
  state: EdgeConnectState
): EdgeConnectPreview['path'] | undefined => {
  if (state.kind !== 'create' || !state.to) {
    return undefined
  }

  const edge: Edge = {
    id: '__preview__',
    source: toPreviewEdgeEnd(state.from),
    target: toPreviewEdgeEnd(state.to),
    type: state.edgeType,
    route: { kind: 'auto' }
  }

  const source = state.from.kind === 'node'
    ? readNodeSnapshot(node, state.from.nodeId)
    : undefined
  const target = state.to.kind === 'node'
    ? readNodeSnapshot(node, state.to.nodeId)
    : undefined

  if (
    (state.from.kind === 'node' && !source)
    || (state.to.kind === 'node' && !target)
  ) {
    return undefined
  }

  const view = resolveEdgeView({
    edge,
    source,
    target
  })

  return {
    svgPath: view.path.svgPath,
    style: edge.style
  }
}

const toDraftEndFromEvaluation = (
  evaluation: EdgeConnectEvaluation
) => toEdgeDraftEnd(
  evaluation.resolution.pointWorld,
  evaluation.resolution.mode === 'free'
    ? undefined
    : {
        nodeId: evaluation.resolution.nodeId,
        anchor: evaluation.resolution.anchor,
        pointWorld: evaluation.resolution.pointWorld
      }
)

export const stepEdgeConnect = (input: {
  state: EdgeConnectState
  world: PointerDownInput['world']
  snap: (input: {
    pointerWorld: PointerDownInput['world']
  }) => EdgeConnectEvaluation
}): {
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
} => {
  const evaluation = input.snap({
    pointerWorld: input.world
  })

  return {
    evaluation,
    state: setEdgeConnectTarget(
      input.state,
      toDraftEndFromEvaluation(evaluation)
    )
  }
}

export const readEdgeConnectGesture = (input: {
  node: Pick<NodeRead, 'canvas'>
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
  showPreviewPath: boolean
}): EdgeGestureDraft => {
  const preview = resolveEdgeConnectPreview(
    input.state,
    input.showPreviewPath
      ? resolveCreatePreviewPath(input.node, input.state)
      : undefined
  )
  const hasConnectFeedback =
    input.evaluation.focusedNodeId !== undefined
    || input.evaluation.resolution.mode !== 'free'

  return {
    patches:
      input.state.kind === 'reconnect' && preview?.patch
        ? [{
            id: input.state.edgeId,
            patch: preview.patch
          }]
        : [],
    guide: preview
      || hasConnectFeedback
      ? {
          path: preview?.path,
          connect: {
            focusedNodeId: input.evaluation.focusedNodeId,
            resolution: input.evaluation.resolution
          }
        }
      : undefined
  }
}

export const commitEdgeConnect = (
  state: EdgeConnectState
) => toEdgeConnectCommit(state)
