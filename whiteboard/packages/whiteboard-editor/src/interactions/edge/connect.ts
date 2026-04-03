import {
  DEFAULT_EDGE_ANCHOR_OFFSET,
  resolveAnchorFromPoint,
  resolveEdgeConnectPreview,
  resolveReconnectDraftEnd,
  setEdgeConnectTarget,
  startEdgeCreate,
  startEdgeReconnect,
  toEdgeConnectCommit,
  toEdgeDraftEnd,
  type EdgeConnectState
} from '@whiteboard/core/edge'
import { getNodeAnchorPoint } from '@whiteboard/core/node'
import type {
  EdgeAnchor,
  EdgeId,
  EdgeType,
  NodeId
} from '@whiteboard/core/types'
import type {
  InteractionStartResult,
  InteractionSession
} from '../../runtime/interaction/types'
import { createEdgeGesture } from '../../runtime/interaction/gesture'
import { readEdgeType } from '../../tool/model'
import type { PointerDownInput } from '../../types/input'
import type { ConnectNodeEntry, EdgeInteractionCtx } from './types'

const readConnectNode = (
  ctx: EdgeInteractionCtx,
  nodeId: NodeId
): ConnectNodeEntry | undefined => {
  const entry = ctx.read.index.node.get(nodeId)
  if (!entry || !ctx.read.node.capability(entry.node).connect) {
    return undefined
  }

  return entry
}

const resolveCreateFromNode = (
  ctx: EdgeInteractionCtx,
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
        point: getNodeAnchorPoint(entry.node, entry.rect, anchor, entry.rotation)
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
    rect: entry.rect,
    rotation: entry.rotation,
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
  ctx: EdgeInteractionCtx,
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
  ctx: EdgeInteractionCtx,
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

    return resolveCreateFromNode(ctx, input, readEdgeType(tool.preset))
      ?? startEdgeCreate({
        pointerId: input.pointerId,
        edgeType: readEdgeType(tool.preset),
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
  ctx: EdgeInteractionCtx,
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

const toConnectGesture = (
  state: EdgeConnectState
) => {
  const preview = resolveEdgeConnectPreview(state)

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
        ? {
            line: preview.line,
            snap: preview.snap
          }
        : undefined
    }
  )
}

export const createEdgeConnectSession = (
  ctx: EdgeInteractionCtx,
  initial: EdgeConnectState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    world: PointerDownInput['world'],
    pointerId: number
  ) => {
    if (pointerId !== state.pointerId) {
      return
    }

    state = setEdgeConnectTarget(
      state,
      toEdgeDraftEnd(world, ctx.snap.edge.connect(world))
    )
    interaction!.gesture = toConnectGesture(state)
  }

  interaction = {
    mode: 'edge-connect',
    pointerId: state.pointerId,
    gesture: toConnectGesture(state),
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
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {}
  }

  return interaction
}

export const startEdgeConnectInteraction = (
  ctx: EdgeInteractionCtx,
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
