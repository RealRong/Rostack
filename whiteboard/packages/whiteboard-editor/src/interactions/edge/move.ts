import { isPointEqual } from '@whiteboard/core/geometry'
import { moveEdge } from '@whiteboard/core/edge'
import type {
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type {
  InteractionControl,
  InteractionSession,
  InteractionSessionTransition
} from '../../runtime/interaction'
import {
  createEdgeMoveGesture
} from '../../runtime/interaction'
import type { EdgeInteractionCtx } from './types'

type EdgeBodyMoveSession = {
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
  session,
  input
}: {
  ctx: EdgeInteractionCtx
  session: EdgeBodyMoveSession
  input: PointerClient
}) => {
  const item = ctx.read.edge.item.get(session.edgeId)
  if (!item || !ctx.read.edge.capability(item.edge).move) {
    return {
      ok: false as const,
      session
    }
  }

  const { world } = readViewport(ctx).pointer(input)
  const delta = {
    x: world.x - session.start.x,
    y: world.y - session.start.y
  }
  if (isPointEqual(delta, session.delta)) {
    return {
      ok: true as const,
      session
    }
  }

  return {
    ok: true as const,
    session: {
      ...session,
      delta
    },
    patch: moveEdge(item.edge, delta)
  }
}

const commitBodyMove = ({
  ctx,
  session
}: {
  ctx: EdgeInteractionCtx
  session: EdgeBodyMoveSession
}) => {
  if (!isPointEqual(session.delta, { x: 0, y: 0 })) {
    ctx.write.document.edge.move(session.edgeId, session.delta)
  }
}

export const createEdgeBodyMoveSession = (
  ctx: EdgeInteractionCtx,
  input: {
    edgeId: EdgeId
    pointerId: number
    start: Point
  },
  control: InteractionControl
): InteractionSession => {
  let session: EdgeBodyMoveSession = {
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
      session,
      input: pointer
    })
    if (!result.ok) {
      return CANCEL
    }

    if (result.session !== session) {
      session = result.session
      interaction!.gesture = createEdgeMoveGesture({
        start: {
          point: input.start,
          edgeId: session.edgeId
        },
        draft: {
          patches: [{
            id: session.edgeId,
            patch: result.patch
          }]
        },
        meta: {}
      })
    }
  }

  interaction = {
    mode: 'edge-drag',
    pointerId: session.pointerId,
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

      control.pan({
        clientX: input.client.x,
        clientY: input.client.y
      })
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
        session
      })
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
