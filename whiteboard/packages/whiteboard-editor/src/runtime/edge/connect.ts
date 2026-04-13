import {
  DEFAULT_EDGE_ANCHOR_OFFSET,
  type EdgeConnectEvaluation,
  type EdgeConnectPreview,
  resolveAnchorFromPoint,
  resolveEdgeConnectPreview,
  resolveEdgeView,
  resolveReconnectDraftEnd,
  setEdgeConnectTarget,
  startEdgeCreate,
  startEdgeReconnect,
  toEdgeConnectCommit,
  toEdgeDraftEnd,
  type EdgeConnectState
} from '@whiteboard/core/edge'
import type { BoardConfig } from '@whiteboard/core/config'
import { getNodeAnchor } from '@whiteboard/core/node'
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
import type { EdgeGestureDraft } from '../interaction/gesture'
import type { EdgeRead } from '../read/edge'
import type { NodeCanvasSnapshot, NodeRead } from '../read/node'

type EdgeConnectNodeRead = Pick<NodeRead, 'canvas' | 'capability'>
type EdgeConnectPreviewNodeRead = Pick<NodeRead, 'canvas'>
type EdgeConnectEdgeRead = Pick<EdgeRead, 'item' | 'resolved' | 'capability'>
type EdgeConnectSnap = (input: {
  pointerWorld: PointerDownInput['world']
}) => EdgeConnectEvaluation

type EdgeConnectStartInput = {
  tool: Tool
  pointer: PointerDownInput
  node: EdgeConnectNodeRead
  edge: EdgeConnectEdgeRead
  zoom: number
  config: BoardConfig['edge']
}

type EdgeConnectStepInput = {
  node: EdgeConnectPreviewNodeRead
  state: EdgeConnectState
  world: PointerDownInput['world']
  snap: EdgeConnectSnap
  showPreviewPath: boolean
}

type EdgeConnectGestureInput = {
  node: EdgeConnectPreviewNodeRead
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
  showPreviewPath: boolean
}

type ConnectNodeEntry = NonNullable<
  ReturnType<EdgeConnectNodeRead['canvas']['get']>
>

const EDGE_PRESET_TYPE = {
  'edge.straight': 'straight',
  'edge.elbow': 'elbow',
  'edge.curve': 'curve'
} as const satisfies Record<EdgePresetKey, EdgeType>

const readNodeRotation = (
  entry: ConnectNodeEntry
) => entry.node.rotation ?? 0

const readEdgePresetType = (
  preset: EdgePresetKey
): EdgeType => EDGE_PRESET_TYPE[preset]

const readConnectNode = (
  node: EdgeConnectNodeRead,
  nodeId: NodeId
): ConnectNodeEntry | undefined => {
  const entry = node.canvas.get(nodeId)
  if (!entry || !node.capability(entry.node).connect) {
    return undefined
  }

  return entry
}

const isNodeHandleConnectPick = (
  pointer: PointerDownInput
) => (
  pointer.pick.kind === 'node'
  && pointer.pick.part === 'connect'
  && Boolean(pointer.pick.side)
)

const shouldBlockFreeCreateStart = (
  pointer: PointerDownInput
) => (
  pointer.editable
  || pointer.ignoreInput
  || pointer.ignoreSelection
)

const startFreeEdgeCreate = (
  pointer: PointerDownInput,
  edgeType: EdgeType
): EdgeConnectState => startEdgeCreate({
  pointerId: pointer.pointerId,
  edgeType,
  from: toEdgeDraftEnd(pointer.world),
  to: toEdgeDraftEnd(pointer.world)
})

const startNodeEdgeCreate = (input: {
  pointer: PointerDownInput
  edgeType: EdgeType
  nodeId: NodeId
  anchor: EdgeAnchor
  point: PointerDownInput['world']
}): EdgeConnectState => startEdgeCreate({
  pointerId: input.pointer.pointerId,
  edgeType: input.edgeType,
  from: {
    kind: 'node',
    nodeId: input.nodeId,
    anchor: input.anchor,
    point: input.point
  },
  to: toEdgeDraftEnd(input.pointer.world)
})

const resolveNodeHandleStart = (input: {
  node: EdgeConnectNodeRead
  pointer: PointerDownInput
  edgeType: EdgeType
}): EdgeConnectState | undefined => {
  const pick = input.pointer.pick
  if (
    pick.kind !== 'node'
    || pick.part !== 'connect'
    || !pick.side
  ) {
    return undefined
  }

  const entry = readConnectNode(input.node, pick.id)
  if (!entry) {
    return undefined
  }

  const anchor: EdgeAnchor = {
    side: pick.side,
    offset: DEFAULT_EDGE_ANCHOR_OFFSET
  }

  return startNodeEdgeCreate({
    pointer: input.pointer,
    edgeType: input.edgeType,
    nodeId: pick.id,
    anchor,
    point: getNodeAnchor(
      entry.node,
      entry.geometry.rect,
      anchor,
      readNodeRotation(entry)
    )
  })
}

const resolveNodeBodyStart = (input: {
  node: EdgeConnectNodeRead
  pointer: PointerDownInput
  edgeType: EdgeType
  zoom: number
  config: BoardConfig['edge']
}): EdgeConnectState | undefined => {
  const pick = input.pointer.pick
  if (
    pick.kind !== 'node'
    || pick.part !== 'body'
  ) {
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

  return startNodeEdgeCreate({
    pointer: input.pointer,
    edgeType: input.edgeType,
    nodeId: pick.id,
    anchor: resolved.anchor,
    point: resolved.point
  })
}

const resolveCreateStart = (input: {
  node: EdgeConnectNodeRead
  pointer: PointerDownInput
  edgeType: EdgeType
  zoom: number
  config: BoardConfig['edge']
}): EdgeConnectState | undefined => (
  resolveNodeHandleStart(input)
  ?? resolveNodeBodyStart(input)
)

const resolveReconnectStart = (input: {
  edge: EdgeConnectEdgeRead
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

export const startEdgeConnect = (
  input: EdgeConnectStartInput
): EdgeConnectState | undefined => {
  if (input.tool.type === 'edge') {
    const edgeType = readEdgePresetType(input.tool.preset)

    if (
      !isNodeHandleConnectPick(input.pointer)
      && shouldBlockFreeCreateStart(input.pointer)
    ) {
      return undefined
    }

    return resolveCreateStart({
      node: input.node,
      pointer: input.pointer,
      edgeType,
      zoom: input.zoom,
      config: input.config
    }) ?? startFreeEdgeCreate(input.pointer, edgeType)
  }

  if (
    input.tool.type !== 'select'
    || input.pointer.pick.kind !== 'edge'
    || input.pointer.pick.part !== 'end'
    || !input.pointer.pick.end
  ) {
    return undefined
  }

  return resolveReconnectStart({
    edge: input.edge,
    edgeId: input.pointer.pick.id,
    end: input.pointer.pick.end,
    pointerId: input.pointer.pointerId
  })
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
    route: { kind: 'auto' }
  }
}

const readPreviewNodeSnapshot = (
  node: EdgeConnectPreviewNodeRead,
  nodeId: NodeId
): NodeCanvasSnapshot | undefined => node.canvas.get(nodeId)

const resolveCreatePreviewPath = (
  node: EdgeConnectPreviewNodeRead,
  state: EdgeConnectState
): EdgeConnectPreview['path'] | undefined => {
  const edge = createPreviewEdge(state)
  const targetDraft = state.kind === 'create'
    ? state.to
    : undefined

  if (!edge || state.kind !== 'create' || !targetDraft) {
    return undefined
  }

  const source = state.from.kind === 'node'
    ? readPreviewNodeSnapshot(node, state.from.nodeId)
    : undefined
  const target = targetDraft.kind === 'node'
    ? readPreviewNodeSnapshot(node, targetDraft.nodeId)
    : undefined

  if (
    (state.from.kind === 'node' && !source)
    || (targetDraft.kind === 'node' && !target)
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

const hasConnectGuide = (
  evaluation: EdgeConnectEvaluation
) => (
  evaluation.focusedNodeId !== undefined
  || evaluation.resolution.mode !== 'free'
)

const readReconnectPreviewPatches = (
  state: EdgeConnectState,
  preview: EdgeConnectPreview | undefined
): EdgeGestureDraft['patches'] => (
  state.kind === 'reconnect' && preview?.patch
    ? [{
        id: state.edgeId,
        patch: preview.patch
      }]
    : []
)

export const readEdgeConnectGesture = (
  input: EdgeConnectGestureInput
): EdgeGestureDraft => {
  const preview = resolveEdgeConnectPreview(
    input.state,
    input.showPreviewPath
      ? resolveCreatePreviewPath(input.node, input.state)
      : undefined
  )

  return {
    patches: readReconnectPreviewPatches(input.state, preview),
    guide: preview || hasConnectGuide(input.evaluation)
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

const applyEdgeConnectEvaluation = (input: {
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
}): EdgeConnectState => setEdgeConnectTarget(
  input.state,
  toDraftEndFromEvaluation(input.evaluation)
)

export const stepEdgeConnect = (
  input: EdgeConnectStepInput
): {
  state: EdgeConnectState
  gesture: EdgeGestureDraft
} => {
  const evaluation = input.snap({
    pointerWorld: input.world
  })
  const state = applyEdgeConnectEvaluation({
    state: input.state,
    evaluation
  })

  return {
    state,
    gesture: readEdgeConnectGesture({
      node: input.node,
      state,
      evaluation,
      showPreviewPath: input.showPreviewPath
    })
  }
}

export const commitEdgeConnect = (
  state: EdgeConnectState
) => toEdgeConnectCommit(state)
