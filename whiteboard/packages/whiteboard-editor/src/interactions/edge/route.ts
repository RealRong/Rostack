import { isPointEqual } from '@whiteboard/core/geometry'
import {
  moveEdge,
  moveRoutePoint
} from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type {
  InteractionControl,
  InteractionSession,
  InteractionSessionTransition,
  InteractionStartResult
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import type {
  BodyMoveSession,
  EdgeInteractionCtx,
  EdgeRoutePick,
  RouteDragSession,
  RoutePoint,
  RouteState
} from './types'

const HANDLED: InteractionStartResult = 'handled'
const FINISH = {
  kind: 'finish'
} satisfies InteractionSessionTransition
const CANCEL = {
  kind: 'cancel'
} satisfies InteractionSessionTransition

type PointerClient = {
  clientX: number
  clientY: number
}

const readViewport = (
  ctx: EdgeInteractionCtx
) => ctx.read.viewport

const isEdgeRoutePick = (
  pick: PointerDownInput['pick']
): pick is EdgeRoutePick => (
  pick.kind === 'edge'
  && pick.part === 'path'
)

const readCapability = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  const item = ctx.read.edge.item.get(edgeId)
  return item
    ? ctx.read.edge.capability(item.edge)
    : undefined
}

const readRouteView = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => ctx.read.edge.resolved.get(edgeId)

const readRouteOrigin = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId,
  index: number
) => {
  const view = readRouteView(ctx, edgeId)
  if (!view || !readCapability(ctx, edgeId)?.editRoute) {
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

const readRoutePoint = (
  ctx: EdgeInteractionCtx,
  pick: EdgeRoutePick
): RoutePoint | undefined => {
  const view = readRouteView(ctx, pick.id)
  if (!view || !readCapability(ctx, pick.id)?.editRoute) {
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
    insertIndex: handle.insertIndex,
    point: handle.point
  }
}

const projectBodyMove = ({
  ctx,
  session,
  input
}: {
  ctx: EdgeInteractionCtx
  session: BodyMoveSession
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

const writeBodyMovePreview = ({
  ctx,
  session,
  patch
}: {
  ctx: EdgeInteractionCtx
  session: BodyMoveSession
  patch: ReturnType<typeof moveEdge>
}) => {
  ctx.write.preview.edge.setInteraction([{
    id: session.edgeId,
    patch
  }])
}

const commitBodyMove = ({
  ctx,
  session
}: {
  ctx: EdgeInteractionCtx
  session: BodyMoveSession
}) => {
  if (!isPointEqual(session.delta, { x: 0, y: 0 })) {
    ctx.write.document.edge.move(session.edgeId, session.delta)
    ctx.write.session.selection.clear()
  }
}

const createBodyMoveSession = (
  ctx: EdgeInteractionCtx,
  initial: BodyMoveSession,
  control: InteractionControl
): InteractionSession => {
  let session = initial

  const step = (
    input: PointerClient
  ): InteractionSessionTransition | void => {
    const result = projectBodyMove({
      ctx,
      session,
      input
    })
    if (!result.ok) {
      return CANCEL
    }

    if (result.session !== session) {
      session = result.session
      writeBodyMovePreview({
        ctx,
        session,
        patch: result.patch
      })
    }
  }

  return {
    mode: 'edge-drag',
    pointerId: session.pointerId,
    autoPan: {
      frame: (pointer) => {
        return step(pointer)
      }
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
    cleanup: () => {
      ctx.write.preview.edge.clearPatches()
    }
  }
}

const projectRouteDrag = ({
  ctx,
  session,
  input
}: {
  ctx: EdgeInteractionCtx
  session: RouteDragSession
  input: PointerClient
}) => {
  const item = ctx.read.edge.item.get(session.edgeId)
  if (!item || !readCapability(ctx, session.edgeId)?.editRoute) {
    return {
      ok: false as const,
      session
    }
  }

  const { world } = readViewport(ctx).pointer(input)
  const point = {
    x: session.origin.x + (world.x - session.start.x),
    y: session.origin.y + (world.y - session.start.y)
  }
  if (isPointEqual(point, session.point)) {
    return {
      ok: true as const,
      session
    }
  }

  return {
    ok: true as const,
    session: {
      ...session,
      point
    },
    patch: moveRoutePoint(item.edge, session.index, point)
  }
}

const writeRouteDragPreview = ({
  ctx,
  session,
  patch
}: {
  ctx: EdgeInteractionCtx
  session: RouteDragSession
  patch: ReturnType<typeof moveRoutePoint>
}) => {
  ctx.write.preview.edge.setInteraction([{
    id: session.edgeId,
    patch,
    activeRouteIndex: session.index
  }])
}

const commitRouteDrag = ({
  ctx,
  session
}: {
  ctx: EdgeInteractionCtx
  session: RouteDragSession
}) => {
  if (
    readCapability(ctx, session.edgeId)?.editRoute
    && !isPointEqual(session.point, session.origin)
  ) {
    ctx.write.document.edge.route.move(session.edgeId, session.index, session.point)
  }
}

const createRouteDragSession = (
  ctx: EdgeInteractionCtx,
  initial: RouteDragSession,
  control: InteractionControl
): InteractionSession => {
  let session = initial
  writeRouteDragPreview({
    ctx,
    session,
    patch: undefined
  })

  const step = (
    input: PointerClient
  ): InteractionSessionTransition | void => {
    const result = projectRouteDrag({
      ctx,
      session,
      input
    })
    if (!result.ok) {
      return CANCEL
    }

    if (result.session !== session) {
      session = result.session
      writeRouteDragPreview({
        ctx,
        session,
        patch: result.patch
      })
    }
  }

  return {
    mode: 'edge-route',
    pointerId: session.pointerId,
    autoPan: {
      frame: (pointer) => {
        return step(pointer)
      }
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

      commitRouteDrag({
        ctx,
        session
      })
      return FINISH
    },
    cleanup: () => {
      ctx.write.preview.edge.clearPatches()
    }
  }
}

const resolveRouteState = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput
): RouteState | null => {
  if (!isEdgeRoutePick(input.pick)) {
    return null
  }

  const routePoint = readRoutePoint(ctx, input.pick)
  if (!routePoint) {
    return null
  }

  return routePoint.kind === 'insert'
    ? {
        kind: 'insert',
        edgeId: routePoint.edgeId,
        worldPoint: input.world
      }
    : input.detail >= 2
      ? {
          kind: 'remove',
          edgeId: routePoint.edgeId,
          index: routePoint.index
        }
      : {
          kind: 'drag',
          edgeId: routePoint.edgeId,
          index: routePoint.index,
          pointerId: input.pointerId,
          start: input.world,
          origin: routePoint.point,
          point: routePoint.point
        }
}

const startEdgeBodyInteraction = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput,
  control: InteractionControl
): InteractionStartResult => {
  if (
    ctx.read.tool.get().type !== 'select'
    || input.pick.kind !== 'edge'
    || input.pick.part !== 'body'
  ) {
    return null
  }

  const item = ctx.read.edge.item.get(input.pick.id)
  const capability = item
    ? ctx.read.edge.capability(item.edge)
    : undefined
  if (!capability) {
    return null
  }

  if (input.modifiers.shift || input.detail >= 2) {
    if (!capability.editRoute) {
      return null
    }

    ctx.write.session.selection.replace({
      edgeIds: [input.pick.id]
    })
    ctx.write.document.edge.route.insert(input.pick.id, input.world)
    ctx.write.preview.edge.clear()
    return HANDLED
  }

  if (!capability.move) {
    return null
  }

  const session: BodyMoveSession = {
    edgeId: input.pick.id,
    pointerId: input.pointerId,
    start: input.world,
    delta: { x: 0, y: 0 }
  }

  ctx.write.session.selection.replace({
    edgeIds: [session.edgeId]
  })

  return createBodyMoveSession(ctx, session, control)
}

const startEdgePathInteraction = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput,
  control: InteractionControl
): InteractionStartResult => {
  if (
    ctx.read.tool.get().type !== 'select'
    || input.pick.kind !== 'edge'
    || input.pick.part !== 'path'
  ) {
    return null
  }

  const routeState = resolveRouteState(ctx, input)
  if (!routeState) {
    return null
  }

  if (routeState.kind === 'remove') {
    ctx.write.document.edge.route.remove(routeState.edgeId, routeState.index)
    ctx.write.preview.edge.clearPatches()
    return HANDLED
  }

  if (routeState.kind === 'insert') {
    const result = ctx.write.document.edge.route.insert(routeState.edgeId, routeState.worldPoint)
    if (!result.ok) {
      ctx.write.preview.edge.clearPatches()
      return HANDLED
    }

    const origin = readRouteOrigin(ctx, routeState.edgeId, result.data.index) ?? routeState.worldPoint
    return createRouteDragSession(ctx, {
        kind: 'drag',
        edgeId: routeState.edgeId,
        index: result.data.index,
        pointerId: input.pointerId,
        start: input.world,
        origin,
        point: origin
      }, control)
  }

  return createRouteDragSession(ctx, routeState, control)
}

export const startEdgeRouteInteraction = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput,
  control: InteractionControl
): InteractionStartResult => (
  startEdgeBodyInteraction(ctx, input, control)
  ?? startEdgePathInteraction(ctx, input, control)
)
