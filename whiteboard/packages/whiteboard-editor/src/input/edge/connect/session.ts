import type { EdgeConnectState } from '@whiteboard/core/edge'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/core/result'
import { createEdgeGesture } from '@whiteboard/editor/input/core/gesture'
import {
  commitEdgeConnect,
  stepEdgeConnect
} from '@whiteboard/editor/input/edge/connect/start'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { InteractionContext } from '@whiteboard/editor/input/context'

const commitConnectState = (
  ctx: InteractionContext,
  state: EdgeConnectState
) => {
  const commit = commitEdgeConnect(state)
  if (!commit) {
    return
  }

  if (commit.kind === 'reconnect') {
    ctx.command.edge.reconnect(commit.edgeId, commit.end, commit.target)
    return
  }

  const result = ctx.command.edge.create(commit.input)
  if (!result.ok) {
    return
  }

  ctx.local.session.tool.set({
    type: 'select'
  })
  ctx.local.session.selection.replace({
    edgeIds: [result.data.edgeId]
  })
}

export const createEdgeConnectSession = (
  ctx: InteractionContext,
  initial: EdgeConnectState
): InteractionSession => {
  let state = initial
  let lastWorld = initial.to?.point ?? initial.from.point
  const originWorld = lastWorld
  let interaction = null as InteractionSession | null

  const shouldShowPreviewPath = (
    world: PointerDownInput['world']
  ) => Math.hypot(
    world.x - originWorld.x,
    world.y - originWorld.y
  ) > 3 / Math.max(ctx.query.viewport.get().zoom, 0.0001)

  const project = (
    world: PointerDownInput['world'],
    pointerId: number
  ) => {
    if (pointerId !== state.pointerId) {
      return
    }

    lastWorld = world
    const result = stepEdgeConnect({
      node: ctx.query.node,
      state,
      world,
      snap: ctx.snap.edge.connect,
      showPreviewPath: shouldShowPreviewPath(world)
    })
    state = result.state
    interaction!.gesture = createEdgeGesture(
      'edge-connect',
      result.gesture
    )
  }

  const initialProjection = stepEdgeConnect({
    node: ctx.query.node,
    state,
    world: lastWorld,
    snap: ctx.snap.edge.connect,
    showPreviewPath: false
  })
  state = initialProjection.state

  interaction = {
    mode: 'edge-connect',
    pointerId: state.pointerId,
    chrome: false,
    gesture: createEdgeGesture(
      'edge-connect',
      initialProjection.gesture
    ),
    autoPan: {
      frame: (pointer) => {
        project(
          ctx.query.viewport.pointer(pointer).world,
          state.pointerId
        )
      }
    },
    move: (input) => {
      project(input.world, input.pointerId)
    },
    up: () => {
      commitConnectState(ctx, state)
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
