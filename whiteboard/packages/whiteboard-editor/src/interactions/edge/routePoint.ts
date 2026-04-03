import { isPointEqual } from '@whiteboard/core/geometry'
import { moveRoutePoint } from '@whiteboard/core/edge'
import type { EdgeId, Point } from '@whiteboard/core/types'
import type {
  InteractionStartResult,
  InteractionSession,
  InteractionSessionTransition
} from '../../runtime/interaction'
import {
  createEdgeRouteGesture
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import type { EdgeInteractionCtx } from './types'

type EdgeRoutePick = Extract<PointerDownInput['pick'], {
  kind: 'edge'
}> & {
  part: 'path'
}

type EdgeRouteHandleTarget =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      index: number
      point: Point
    }

type EdgeRouteDragState = {
  edgeId: EdgeId
  index: number
  pointerId: number
  start: Point
  origin: Point
  point: Point
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

const HANDLED: InteractionStartResult = 'handled'

const readViewport = (
  ctx: EdgeInteractionCtx
) => ctx.read.viewport

const readEditableRouteView = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  const view = ctx.read.edge.resolved.get(edgeId)
  return view && readCapability(ctx, edgeId)?.editRoute
    ? view
    : undefined
}

const readCapability = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  const item = ctx.read.edge.item.get(edgeId)
  return item
    ? ctx.read.edge.capability(item.edge)
    : undefined
}

const selectEdge = (
  ctx: EdgeInteractionCtx,
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

const resolveEdgeRouteHandleTarget = (
  ctx: EdgeInteractionCtx,
  pick: PointerDownInput['pick']
): EdgeRouteHandleTarget | undefined => {
  if (!isEdgeRoutePick(pick)) {
    return undefined
  }

  const view = readEditableRouteView(ctx, pick.id)
  if (!view) {
    return undefined
  }

  if (pick.index !== undefined) {
    const handle = view.handles.find((entry) => (
      entry.kind === 'anchor'
      && entry.index === pick.index
    ))
    if (!handle || handle.kind !== 'anchor') {
      return undefined
    }

    return {
      kind: 'anchor',
      edgeId: pick.id,
      index: handle.index,
      point: handle.point
    }
  }

  const insertIndex = pick.insert ?? 0
  const handle = view.handles.find((entry) => (
    entry.kind === 'insert'
    && entry.insertIndex === insertIndex
  ))
  if (!handle || handle.kind !== 'insert') {
    return undefined
  }

  return {
    kind: 'insert',
    edgeId: pick.id,
    index: handle.insertIndex,
    point: handle.point
  }
}

const readRouteAnchorPoint = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId,
  index: number
) => {
  const view = readEditableRouteView(ctx, edgeId)
  if (!view) {
    return undefined
  }

  const handle = view.handles.find((entry) => (
    entry.kind === 'anchor'
    && entry.index === index
  ))

  return handle?.kind === 'anchor'
    ? handle.point
    : undefined
}

const projectRouteDrag = ({
  ctx,
  state,
  input
}: {
  ctx: EdgeInteractionCtx
  state: EdgeRouteDragState
  input: PointerClient
}) => {
  const item = ctx.read.edge.item.get(state.edgeId)
  if (!item || !readCapability(ctx, state.edgeId)?.editRoute) {
    return {
      ok: false as const,
      state
    }
  }

  const { world } = readViewport(ctx).pointer(input)
  const point = {
    x: state.origin.x + (world.x - state.start.x),
    y: state.origin.y + (world.y - state.start.y)
  }
  if (isPointEqual(point, state.point)) {
    return {
      ok: true as const,
      state
    }
  }

  return {
    ok: true as const,
    state: {
      ...state,
      point
    },
    patch: moveRoutePoint(item.edge, state.index, point)
  }
}

const commitRouteDrag = ({
  ctx,
  state
}: {
  ctx: EdgeInteractionCtx
  state: EdgeRouteDragState
}) => {
  if (
    readCapability(ctx, state.edgeId)?.editRoute
    && !isPointEqual(state.point, state.origin)
  ) {
    ctx.write.document.edge.route.move(state.edgeId, state.index, state.point)
  }
}

export const createEdgeRoutePointSession = (
  ctx: EdgeInteractionCtx,
  input: {
    edgeId: EdgeId
    index: number
    pointerId: number
    start: Point
    origin: Point
    point?: Point
  }
): InteractionSession => {
  let state: EdgeRouteDragState = {
    edgeId: input.edgeId,
    index: input.index,
    pointerId: input.pointerId,
    start: input.start,
    origin: input.origin,
    point: input.point ?? input.origin
  }
  let interaction = null as InteractionSession | null

  const step = (
    pointer: PointerClient
  ): InteractionSessionTransition | void => {
    const result = projectRouteDrag({
      ctx,
      state,
      input: pointer
    })
    if (!result.ok) {
      return CANCEL
    }

    if (result.state !== state) {
      state = result.state
      interaction!.gesture = createEdgeRouteGesture({
        draft: {
          patches: [{
            id: state.edgeId,
            patch: result.patch,
            activeRouteIndex: state.index
          }]
        }
      })
    }
  }

  interaction = {
    mode: 'edge-route',
    pointerId: state.pointerId,
    gesture: createEdgeRouteGesture({
      draft: {
        patches: [{
          id: state.edgeId,
          activeRouteIndex: state.index
        }]
      }
    }),
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

      commitRouteDrag({
        ctx,
        state
      })
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

export const startEdgeRouteHandleInteraction = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput
): InteractionStartResult | null => {
  const tool = ctx.read.tool.get()
  if (tool.type !== 'select') {
    return null
  }

  const target = resolveEdgeRouteHandleTarget(ctx, start.pick)
  if (!target) {
    return null
  }

  if (target.kind === 'anchor' && start.detail >= 2) {
    ctx.write.document.edge.route.remove(target.edgeId, target.index)
    ctx.write.preview.edge.clearPatches()
    return HANDLED
  }

  if (target.kind === 'anchor') {
    selectEdge(ctx, target.edgeId)
    return createEdgeRoutePointSession(ctx, {
      edgeId: target.edgeId,
      index: target.index,
      pointerId: start.pointerId,
      start: start.world,
      origin: target.point
    })
  }

  selectEdge(ctx, target.edgeId)
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
    start: start.world,
    origin: readRouteAnchorPoint(ctx, target.edgeId, result.data.index) ?? start.world
  })
}
