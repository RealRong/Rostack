import {
  resolveEdgeRouteHandleTarget,
  type EdgeRouteHandleTarget,
  type EdgeView
} from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type {
  InteractionStartResult,
  InteractionSession
} from '../../runtime/interaction/types'
import {
  CANCEL,
  FINISH,
  HANDLED
} from '../../runtime/interaction/result'
import { createEdgeGesture } from '../../runtime/interaction/gesture'
import type { PointerDownInput } from '../../types/input'
import type { InteractionContext } from '../context'
import {
  finishRouteHandleState,
  type RouteHandleState,
  startRouteHandleState,
  startStepSegmentRouteHandleState,
  stepRouteHandleState
} from './routeHandle'

type EdgeRoutePick = Extract<PointerDownInput['pick'], {
  kind: 'edge'
}> & {
  part: 'path'
}

type PointerClient = {
  clientX: number
  clientY: number
}

const readViewport = (
  ctx: InteractionContext
) => ctx.read.viewport

const readCapability = (
  ctx: InteractionContext,
  edgeId: EdgeId
) => {
  const item = ctx.read.edge.item.get(edgeId)
  return item
    ? ctx.read.edge.capability(item.edge)
    : undefined
}

const readEditableRouteView = (
  ctx: InteractionContext,
  edgeId: EdgeId
): EdgeView | undefined => {
  const view = ctx.read.edge.resolved.get(edgeId)

  return view && readCapability(ctx, edgeId)?.editRoute
    ? view
    : undefined
}

const selectEdge = (
  ctx: InteractionContext,
  edgeId: EdgeId
) => {
  ctx.write.session.selection.replace({
    edgeIds: [edgeId]
  })
}

const isEdgeRoutePick = (
  pick: PointerDownInput['pick']
): pick is EdgeRoutePick => (
  pick.kind === 'edge'
  && pick.part === 'path'
)

const resolvePickTarget = (
  ctx: InteractionContext,
  pick: PointerDownInput['pick']
): EdgeRouteHandleTarget | undefined => {
  if (!isEdgeRoutePick(pick)) {
    return undefined
  }

  const view = readEditableRouteView(ctx, pick.id)
  if (!view) {
    return undefined
  }

  return resolveEdgeRouteHandleTarget({
    edgeId: pick.id,
    handles: view.handles,
    pick: {
      index: pick.index,
      insert: pick.insert,
      segment: pick.segment
    }
  })
}

const createEdgeRouteSession = (input: {
  ctx: InteractionContext
  state: RouteHandleState
  commit: (commit: ReturnType<typeof finishRouteHandleState>) => void
}): InteractionSession => {
  const {
    ctx,
    commit
  } = input
  let state = input.state
  let interaction = null as InteractionSession | null

  const step = (
    pointer: PointerClient
  ) => {
    const item = ctx.read.edge.item.get(state.edgeId)
    if (!item || !readCapability(ctx, state.edgeId)?.editRoute) {
      return CANCEL
    }

    const result = stepRouteHandleState({
      state,
      edge: item.edge,
      pointerWorld: readViewport(ctx).pointer(pointer).world
    })
    state = result.state

    if (!result.draft?.patch) {
      return
    }

    interaction!.gesture = createEdgeGesture(
      'edge-route',
      {
        patches: [{
          id: state.edgeId,
          patch: result.draft.patch,
          activeRouteIndex: result.draft.activeRouteIndex
        }]
      }
    )
  }

  interaction = {
    mode: 'edge-route',
    pointerId: state.pointerId,
    gesture: createEdgeGesture(
      'edge-route',
      {
        patches: [{
          id: state.edgeId,
          activeRouteIndex: state.index
        }]
      }
    ),
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

      commit(finishRouteHandleState(state))
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
): InteractionSession => createEdgeRouteSession({
  ctx,
  state: startRouteHandleState({
    edgeId: input.edgeId,
    index: input.index,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin,
    point: input.point
  }),
  commit: (commit) => {
    if (!readCapability(ctx, commit.edgeId)?.editRoute) {
      return
    }

    if (commit.route) {
      ctx.write.edge.update(commit.edgeId, {
        route: commit.route
      })
      return
    }

    if (commit.point) {
      ctx.write.edge.route.move(commit.edgeId, commit.index, commit.point)
    }
  }
})

export const startEdgeRouteHandleInteraction = (
  ctx: InteractionContext,
  start: PointerDownInput
): InteractionStartResult | null => {
  const tool = ctx.read.tool.get()
  if (tool.type !== 'select') {
    return null
  }

  const target = resolvePickTarget(ctx, start.pick)
  if (!target) {
    return null
  }

  if (target.kind === 'anchor' && start.detail >= 2) {
    ctx.write.edge.route.remove(target.edgeId, target.index)
    ctx.write.preview.edge.clearPatches()
    return HANDLED
  }

  selectEdge(ctx, target.edgeId)

  if (target.kind === 'anchor') {
    return createEdgeRoutePointSession(ctx, {
      edgeId: target.edgeId,
      index: target.index,
      pointerId: start.pointerId,
      startWorld: start.world,
      origin: target.point
    })
  }

  if (target.kind === 'segment') {
    const item = ctx.read.edge.item.get(target.edgeId)
    const view = readEditableRouteView(ctx, target.edgeId)
    if (item?.edge.type === 'elbow' && view) {
      return createEdgeRouteSession({
        ctx,
        state: startStepSegmentRouteHandleState({
          edgeId: target.edgeId,
          index: target.index,
          segmentIndex: target.segmentIndex,
          axis: target.axis,
          pointerId: start.pointerId,
          startWorld: start.world,
          origin: target.point,
          pathPoints: view.path.points,
          baseRoutePoints:
            item.edge.route?.kind === 'manual'
              ? item.edge.route.points
              : []
        }),
        commit: (commit) => {
          if (commit.route) {
            ctx.write.edge.update(commit.edgeId, {
              route: commit.route
            })
          }
        }
      })
    }
  }

  const result = ctx.write.edge.route.insert(
    target.edgeId,
    start.world
  )
  if (!result.ok) {
    ctx.write.preview.edge.clearPatches()
    return HANDLED
  }

  return createEdgeRoutePointSession(ctx, {
    edgeId: target.edgeId,
    index: result.data.index,
    pointerId: start.pointerId,
    startWorld: start.world,
    origin: target.point
  })
}
