import {
  DEFAULT_EDGE_ANCHOR_OFFSET,
  type EdgeConnectEvaluation,
  type EdgeConnectPreview,
  type EdgeNodeCanvasSnapshot,
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
import type {
  Edge,
  EdgeAnchor,
  EdgeEnd,
  EdgeId,
  EdgeType,
  NodeId
} from '@whiteboard/core/types'
import type {
  InteractionStartResult,
  InteractionSession
} from '../../runtime/interaction/types'
import { FINISH } from '../../runtime/interaction/result'
import { createEdgeGesture } from '../../runtime/interaction/gesture'
import type { EdgePresetKey } from '../../types/tool'
import type { PointerDownInput } from '../../types/input'
import type { InteractionContext } from '../context'

type ConnectNodeEntry = NonNullable<
  ReturnType<InteractionContext['read']['index']['node']['get']>
>

const readNodeRotation = (
  entry: ConnectNodeEntry
) => (
  entry.node.type === 'group'
    ? 0
    : (entry.node.rotation ?? 0)
)

const EDGE_PRESET_TYPE = {
  'edge.straight': 'linear',
  'edge.elbow': 'step',
  'edge.curve': 'curve'
} as const satisfies Record<EdgePresetKey, EdgeType>

const readEdgePresetType = (
  preset: EdgePresetKey
): EdgeType => EDGE_PRESET_TYPE[preset]

const readConnectNode = (
  ctx: InteractionContext,
  nodeId: NodeId
): ConnectNodeEntry | undefined => {
  const entry = ctx.read.index.node.get(nodeId)
  if (!entry || !ctx.read.node.capability(entry.node).connect) {
    return undefined
  }

  return entry
}

const resolveCreateFromNode = (
  ctx: InteractionContext,
  input: PointerDownInput,
  edgeType: EdgeType
): EdgeConnectState | undefined => {
  const pick = input.pick
  if (pick.kind !== 'node') {
    return undefined
  }

  if (pick.part === 'connect' && pick.side) {
    const entry = readConnectNode(ctx, pick.id)
    if (!entry) {
      return undefined
    }

    const anchor: EdgeAnchor = {
      side: pick.side,
      offset: DEFAULT_EDGE_ANCHOR_OFFSET
    }

    return startEdgeCreate({
      pointerId: input.pointerId,
      edgeType,
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
      to: toEdgeDraftEnd(input.world)
    })
  }

  if (pick.part !== 'body' && pick.part !== 'shell') {
    return undefined
  }

  const entry = readConnectNode(ctx, pick.id)
  if (!entry) {
    return undefined
  }

  const resolved = resolveAnchorFromPoint({
    node: entry.node,
    rect: entry.geometry.rect,
    rotation: readNodeRotation(entry),
    pointWorld: input.world,
    zoom: ctx.read.viewport.get().zoom,
    config: ctx.config.edge
  })

  return startEdgeCreate({
    pointerId: input.pointerId,
    edgeType,
    from: {
      kind: 'node',
      nodeId: pick.id,
      anchor: resolved.anchor,
      point: resolved.point
    },
    to: toEdgeDraftEnd(input.world)
  })
}

const resolveReconnectState = (
  ctx: InteractionContext,
  edgeId: EdgeId,
  end: 'source' | 'target',
  pointerId: number
): EdgeConnectState | undefined => {
  const item = ctx.read.edge.item.get(edgeId)
  const resolved = ctx.read.edge.resolved.get(edgeId)
  if (!item || !resolved) {
    return undefined
  }

  const capability = ctx.read.edge.capability(item.edge)
  if (
    (end === 'source' && !capability.reconnectSource)
    || (end === 'target' && !capability.reconnectTarget)
  ) {
    return undefined
  }

  return startEdgeReconnect({
    pointerId,
    edgeId,
    end,
    from: resolveReconnectDraftEnd({
      end: item.edge[end],
      point: resolved.ends[end].point,
      anchor: resolved.ends[end].anchor,
      anchorOffset: DEFAULT_EDGE_ANCHOR_OFFSET
    })
  })
}

const resolveEdgeConnectState = (
  ctx: InteractionContext,
  input: PointerDownInput
): EdgeConnectState | undefined => {
  const tool = ctx.read.tool.get()

  if (tool.type === 'edge') {
    const canStartFromNodeHandle =
      input.pick.kind === 'node'
      && input.pick.part === 'connect'
      && Boolean(input.pick.side)

    if (
      !canStartFromNodeHandle
      && (input.editable || input.ignoreInput || input.ignoreSelection)
    ) {
      return undefined
    }

    return resolveCreateFromNode(ctx, input, readEdgePresetType(tool.preset))
      ?? startEdgeCreate({
        pointerId: input.pointerId,
        edgeType: readEdgePresetType(tool.preset),
        from: toEdgeDraftEnd(input.world),
        to: toEdgeDraftEnd(input.world)
      })
  }

  if (
    tool.type !== 'select'
    || input.pick.kind !== 'edge'
    || input.pick.part !== 'end'
    || !input.pick.end
  ) {
    return undefined
  }

  return resolveReconnectState(
    ctx,
    input.pick.id,
    input.pick.end,
    input.pointerId
  )
}

const commitConnectState = (
  ctx: InteractionContext,
  state: EdgeConnectState
) => {
  const commit = toEdgeConnectCommit(state)
  if (!commit) {
    return
  }

  if (commit.kind === 'reconnect') {
    ctx.write.document.edge.reconnect(commit.edgeId, commit.end, commit.target)
    return
  }

  ctx.write.document.edge.create(commit.input)
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

const readNodeSnapshot = (
  ctx: InteractionContext,
  nodeId: NodeId
): EdgeNodeCanvasSnapshot | undefined => {
  const entry = ctx.read.index.node.get(nodeId)
  if (!entry) {
    return undefined
  }

  return {
    node: entry.node,
    geometry: entry.geometry
  }
}

const resolveCreatePreviewPath = (
  ctx: InteractionContext,
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
    ? readNodeSnapshot(ctx, state.from.nodeId)
    : undefined
  const target = state.to.kind === 'node'
    ? readNodeSnapshot(ctx, state.to.nodeId)
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

const toConnectGesture = (
  ctx: InteractionContext,
  state: EdgeConnectState,
  evaluation: EdgeConnectEvaluation,
  showPreviewPath: boolean
) => {
  const preview = resolveEdgeConnectPreview(
    state,
    showPreviewPath
      ? resolveCreatePreviewPath(ctx, state)
      : undefined
  )
  const hasConnectFeedback =
    evaluation.focusedNodeId !== undefined
    || evaluation.resolution.mode !== 'free'

  return createEdgeGesture(
    'edge-connect',
    {
      patches:
        state.kind === 'reconnect' && preview?.patch
          ? [{
              id: state.edgeId,
              patch: preview.patch
            }]
          : [],
      guide: preview
        || hasConnectFeedback
        ? {
            path: preview?.path,
            connect: {
              focusedNodeId: evaluation.focusedNodeId,
              resolution: evaluation.resolution
            }
          }
        : undefined
    }
  )
}

export const createEdgeConnectSession = (
  ctx: InteractionContext,
  initial: EdgeConnectState
): InteractionSession => {
  let state = initial
  let evaluation: EdgeConnectEvaluation = {
    resolution: {
      mode: 'free',
      pointWorld: initial.to?.point ?? initial.from.point
    }
  }
  let lastWorld = initial.to?.point ?? initial.from.point
  const originWorld = lastWorld
  let interaction = null as InteractionSession | null

  const showPreviewPath = () => Math.hypot(
    lastWorld.x - originWorld.x,
    lastWorld.y - originWorld.y
  ) > 3 / Math.max(ctx.read.viewport.get().zoom, 0.0001)

  const refreshGesture = () => {
    if (!interaction) {
      return
    }

    interaction.gesture = toConnectGesture(
      ctx,
      state,
      evaluation,
      showPreviewPath()
    )
  }

  const evaluate = (
    world: PointerDownInput['world']
  ) => {
    lastWorld = world
    evaluation = ctx.snap.edge.connect({
      pointerWorld: world
    })
    state = setEdgeConnectTarget(
      state,
      toDraftEndFromEvaluation(evaluation)
    )
    refreshGesture()
  }

  const step = (
    world: PointerDownInput['world'],
    pointerId: number
  ) => {
    if (pointerId !== state.pointerId) {
      return
    }

    evaluate(world)
  }

  evaluate(lastWorld)

  interaction = {
    mode: 'edge-connect',
    pointerId: state.pointerId,
    gesture: toConnectGesture(ctx, state, evaluation, false),
    autoPan: {
      frame: (pointer) => {
        step(
          ctx.read.viewport.pointer(pointer).world,
          state.pointerId
        )
      }
    },
    move: (input) => {
      step(input.world, input.pointerId)
    },
    up: () => {
      commitConnectState(ctx, state)
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

export const startEdgeConnectInteraction = (
  ctx: InteractionContext,
  input: PointerDownInput
): InteractionStartResult | null => {
  const state = resolveEdgeConnectState(ctx, input)
  if (!state) {
    return null
  }

  if (state.kind === 'reconnect') {
    ctx.write.session.selection.replace({
      edgeIds: [state.edgeId]
    })
  }

  return createEdgeConnectSession(ctx, state)
}
