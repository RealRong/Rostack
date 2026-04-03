import { isPointEqual } from '@whiteboard/core/geometry'
import { moveEdge } from '@whiteboard/core/edge'
import type {
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type {
  InteractionSession,
  InteractionSessionTransition
} from '../../runtime/interaction'
import {
  createEdgeMoveGesture
} from '../../runtime/interaction'
import type { EdgeInteractionCtx } from './types'

type EdgeBodyMoveState = {
  edgeId: EdgeId
  pointerId: number
  start: Point
  delta: Point
}

type PointerClient = {
  clientX: number
  clientY: number
}

const FINISH = {
  kind: 'finish'
} satisfies InteractionSessionTransition

const CANCEL = {
  kind: 'cancel'
} satisfies InteractionSessionTransition

const readViewport = (
  ctx: EdgeInteractionCtx
) => ctx.read.viewport

const projectBodyMove = ({
  ctx,
  state,
  input
}: {
  ctx: EdgeInteractionCtx
  state: EdgeBodyMoveState
  input: PointerClient
}) => {
  const item = ctx.read.edge.item.get(state.edgeId)
  if (!item || !ctx.read.edge.capability(item.edge).move) {
    return {
      ok: false as const,
      state
    }
  }

  const { world } = readViewport(ctx).pointer(input)
  const delta = {
    x: world.x - state.start.x,
    y: world.y - state.start.y
  }
  if (isPointEqual(delta, state.delta)) {
    return {
      ok: true as const,
      state
    }
  }

  return {
    ok: true as const,
    state: {
      ...state,
      delta
    },
    patch: moveEdge(item.edge, delta)
  }
}

const commitBodyMove = ({
  ctx,
  state
}: {
  ctx: EdgeInteractionCtx
  state: EdgeBodyMoveState
}) => {
  if (!isPointEqual(state.delta, { x: 0, y: 0 })) {
    ctx.write.document.edge.move(state.edgeId, state.delta)
  }
}

export const createEdgeBodyMoveSession = (
  ctx: EdgeInteractionCtx,
  input: {
    edgeId: EdgeId
    pointerId: number
    start: Point
  }
): InteractionSession => {
  let state: EdgeBodyMoveState = {
    edgeId: input.edgeId,
    pointerId: input.pointerId,
    start: input.start,
    delta: { x: 0, y: 0 }
  }
  let interaction = null as InteractionSession | null

  const step = (
    pointer: PointerClient
  ): InteractionSessionTransition | void => {
    const result = projectBodyMove({
      ctx,
      state,
      input: pointer
    })
    if (!result.ok) {
      return CANCEL
    }

    if (result.state !== state) {
      state = result.state
      interaction!.gesture = createEdgeMoveGesture({
        draft: {
          patches: [{
            id: state.edgeId,
            patch: result.patch
          }]
        }
      })
    }
  }

  interaction = {
    mode: 'edge-drag',
    pointerId: state.pointerId,
    gesture: null,
    autoPan: {
      frame: (pointer) => step(pointer)
    },
    move: (input) => {
      const transition = step({
        clientX: input.client.x,
        clientY: input.client.y
      })
      if (transition) {
        return transition
      }
    },
    up: (input) => {
      const transition = step({
        clientX: input.client.x,
        clientY: input.client.y
      })
      if (transition) {
        return transition
      }

      commitBodyMove({
        ctx,
        state
      })
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
