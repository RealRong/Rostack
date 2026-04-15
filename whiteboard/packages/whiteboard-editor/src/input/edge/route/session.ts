import type { EdgeId } from '@whiteboard/core/types'
import {
  GestureTuning
} from '@whiteboard/editor/input/core/config'
import { createEdgeGesture } from '@whiteboard/editor/input/core/gesture'
import {
  CANCEL,
  FINISH,
  replaceSession
} from '@whiteboard/editor/input/core/result'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import {
  commitEdgeRoute,
  startEdgeRoutePoint,
  stepEdgeRoute,
  type EdgeRouteHandleState
} from '@whiteboard/editor/input/edge/route/start'
import type {
  PointerDownInput,
  PointerMoveInput
} from '@whiteboard/editor/types/input'

type PointerClient = {
  clientX: number
  clientY: number
}

type EdgeRoutePressPlan =
  | {
      kind: 'route'
      state: EdgeRouteHandleState
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      pointerId: number
      startWorld: PointerDownInput['world']
      origin: PointerDownInput['world']
      point: PointerDownInput['world']
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

const isDragStart = (
  start: PointerDownInput,
  input: PointerMoveInput
) => Math.hypot(
  input.client.x - start.client.x,
  input.client.y - start.client.y
) >= GestureTuning.dragMinDistance

export const createEdgeRouteSession = (
  ctx: InteractionContext,
  initial: EdgeRouteHandleState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null
  const baseEdge = ctx.query.edge.item.get(initial.edgeId)?.edge

  const step = (
    pointer: PointerClient
  ) => {
    const item = ctx.query.edge.item.get(state.edgeId)
    if (!item || !baseEdge || !ctx.query.edge.capability(item.edge).editRoute) {
      return CANCEL
    }

    const result = stepEdgeRoute({
      state,
      edge: baseEdge,
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
    chrome: false,
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

const createInsertedRouteSession = (
  ctx: InteractionContext,
  input: Extract<EdgeRoutePressPlan, { kind: 'insert' }>
) => {
  const result = ctx.command.edge.route.insert(
    input.edgeId,
    input.point
  )
  if (!result.ok) {
    ctx.local.feedback.edge.clearPatches()
    return null
  }

  return createEdgeRoutePointSession(ctx, {
    edgeId: input.edgeId,
    index: result.data.index,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin
  })
}

export const createEdgeRoutePressSession = (
  ctx: InteractionContext,
  start: PointerDownInput,
  plan: EdgeRoutePressPlan
): InteractionSession => ({
  mode: 'press',
  pointerId: start.pointerId,
  chrome: true,
  move: (input) => {
    if (!isDragStart(start, input)) {
      return
    }

    const next = plan.kind === 'route'
      ? createEdgeRouteSession(ctx, plan.state)
      : createInsertedRouteSession(ctx, plan)
    if (!next) {
      return FINISH
    }

    next.move?.(input)
    return replaceSession(next)
  },
  up: () => {
    if (plan.kind === 'insert') {
      createInsertedRouteSession(ctx, plan)
    }

    return FINISH
  },
  cleanup: () => {}
})

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
