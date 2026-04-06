import {
  finishRouteHandleState,
  resolveRouteHandleTarget,
  startRouteHandleState,
  startStepSegmentRouteHandleState,
  stepRouteHandleState,
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
) => {
  if (!isEdgeRoutePick(pick)) {
    return undefined
  }

  const view = readEditableRouteView(ctx, pick.id)
  if (!view) {
    return undefined
  }

  return resolveRouteHandleTarget({
    edgeId: pick.id,
    handles: view.handles,
    pick: {
      index: pick.index,
      insert: pick.insert,
      segment: pick.segment
    }
  })
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
): InteractionSession => {
  let state = startRouteHandleState({
    edgeId: input.edgeId,
    index: input.index,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin,
    point: input.point
  })
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

    if (!result.draft) {
      return
    }
    if (!result.draft.patch) {
      return CANCEL
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

      const commit = finishRouteHandleState(state)
      if (!readCapability(ctx, state.edgeId)?.editRoute) {
        return FINISH
      }

      if (commit.route) {
        ctx.write.document.edge.update(commit.edgeId, {
          route: commit.route
        })
      } else if (commit.point) {
        ctx.write.document.edge.route.move(commit.edgeId, commit.index, commit.point)
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

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
    ctx.write.document.edge.route.remove(target.edgeId, target.index)
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
    if (item?.edge.type === 'step' && view) {
      let state = startStepSegmentRouteHandleState({
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
      })
      let interaction = null as InteractionSession | null

      const step = (
        pointer: PointerClient
      ) => {
        const edgeItem = ctx.read.edge.item.get(state.edgeId)
        if (!edgeItem || !readCapability(ctx, state.edgeId)?.editRoute) {
          return CANCEL
        }

        const result = stepRouteHandleState({
          state,
          edge: edgeItem.edge,
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
        move: (input) => step({
          clientX: input.client.x,
          clientY: input.client.y
        }) || undefined,
        up: (input) => {
          const transition = step({
            clientX: input.client.x,
            clientY: input.client.y
          })
          if (transition) {
            return transition
          }

          const commit = finishRouteHandleState(state)
          if (commit.route) {
            ctx.write.document.edge.update(commit.edgeId, {
              route: commit.route
            })
          }

          return FINISH
        },
        cleanup: () => {}
      }

      return interaction
    }
  }

  const result = ctx.write.document.edge.route.insert(
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
