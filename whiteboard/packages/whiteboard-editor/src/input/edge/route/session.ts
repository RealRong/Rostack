import type { EdgeId } from '@whiteboard/core/types'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import {
  CANCEL,
  FINISH
} from '@whiteboard/editor/input/core/result'
import { createEdgeGesture } from '@whiteboard/editor/input/core/gesture'
import {
  commitEdgeRoute,
  startEdgeRoutePoint,
  stepEdgeRoute,
  type EdgeRouteHandleState
} from '@whiteboard/editor/input/edge/route/start'

type PointerClient = {
  clientX: number
  clientY: number
}

const readViewportWorld = (
  ctx: InteractionContext,
  pointer: PointerClient
) => ctx.query.viewport.pointer(pointer).world

const readRouteGesture = (
  state: EdgeRouteHandleState,
  patch?: ReturnType<typeof stepEdgeRoute>['draft']
) => createEdgeGesture(
  'edge-route',
  {
    patches: [{
      id: state.edgeId,
      activeRouteIndex: state.index,
      ...(patch?.patch
        ? {
            patch: patch.patch
          }
        : {})
    }]
  }
)

export const createEdgeRouteSession = (
  ctx: InteractionContext,
  initial: EdgeRouteHandleState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    pointer: PointerClient
  ) => {
    const item = ctx.query.edge.item.get(state.edgeId)
    if (!item || !ctx.query.edge.capability(item.edge).editRoute) {
      return CANCEL
    }

    const result = stepEdgeRoute({
      state,
      edge: item.edge,
      pointerWorld: readViewportWorld(ctx, pointer)
    })
    state = result.state
    interaction!.gesture = readRouteGesture(
      state,
      result.draft
    )
  }

  interaction = {
    mode: 'edge-route',
    pointerId: state.pointerId,
    gesture: readRouteGesture(state),
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

      const commit = commitEdgeRoute(state)
      if (commit?.kind === 'update-route') {
        ctx.command.edge.update(commit.edgeId, {
          route: commit.route
        })
      }

      if (commit?.kind === 'move-point') {
        ctx.command.edge.route.move(commit.edgeId, commit.index, commit.point)
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

export const createEdgeRoutePointSession = (
  ctx: InteractionContext,
  input: {
    edgeId: EdgeId
    index: number
    pointerId: number
    startWorld: PointerDownInput['world']
    origin: PointerDownInput['world']
    point?: PointerDownInput['world']
  }
): InteractionSession => createEdgeRouteSession(
  ctx,
  startEdgeRoutePoint({
    edgeId: input.edgeId,
    index: input.index,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin,
    point: input.point
  })
)
