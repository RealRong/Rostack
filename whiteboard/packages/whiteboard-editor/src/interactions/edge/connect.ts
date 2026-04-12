import type { EdgeConnectState } from '@whiteboard/core/edge'
import type { InteractionSession } from '../../runtime/interaction/types'
import { FINISH } from '../../runtime/interaction/result'
import { createEdgeGesture } from '../../runtime/interaction/gesture'
import {
  commitEdgeConnect,
  stepEdgeConnect
} from '../../runtime/edge/connect'
import type { PointerDownInput } from '../../types/input'
import type { InteractionContext } from '../context'

const commitConnectState = (
  ctx: InteractionContext,
  state: EdgeConnectState
) => {
  const commit = commitEdgeConnect(state)
  if (!commit) {
    return
  }

  if (commit.kind === 'reconnect') {
    ctx.write.edge.reconnect(commit.edgeId, commit.end, commit.target)
    return
  }

  ctx.write.edge.create(commit.input)
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
  ) > 3 / Math.max(ctx.read.viewport.get().zoom, 0.0001)

  const project = (
    world: PointerDownInput['world'],
    pointerId: number
  ) => {
    if (pointerId !== state.pointerId) {
      return
    }

    lastWorld = world
    const result = stepEdgeConnect({
      node: ctx.read.node,
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
    node: ctx.read.node,
    state,
    world: lastWorld,
    snap: ctx.snap.edge.connect,
    showPreviewPath: false
  })
  state = initialProjection.state

  interaction = {
    mode: 'edge-connect',
    pointerId: state.pointerId,
    gesture: createEdgeGesture(
      'edge-connect',
      initialProjection.gesture
    ),
    autoPan: {
      frame: (pointer) => {
        project(
          ctx.read.viewport.pointer(pointer).world,
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
