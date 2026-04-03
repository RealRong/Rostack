import { isPointEqual } from '@whiteboard/core/geometry'
import { moveRoutePoint } from '@whiteboard/core/edge'
import type { EdgeId, Point } from '@whiteboard/core/types'
import type {
  InteractionControl,
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

export type EdgeRoutePointTarget =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      insertIndex: number
      point: Point
    }

type EdgeRouteDragSession = {
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

const readViewport = (
  ctx: EdgeInteractionCtx
) => ctx.read.viewport

const readRouteView = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => ctx.read.edge.resolved.get(edgeId)

const readCapability = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  const item = ctx.read.edge.item.get(edgeId)
  return item
    ? ctx.read.edge.capability(item.edge)
    : undefined
}

const isEdgeRoutePick = (
  pick: PointerDownInput['pick']
): pick is EdgeRoutePick => (
  pick.kind === 'edge'
  && pick.part === 'path'
)

export const resolveEdgeRoutePointTarget = (
  ctx: EdgeInteractionCtx,
  pick: PointerDownInput['pick']
): EdgeRoutePointTarget | undefined => {
  if (!isEdgeRoutePick(pick)) {
    return undefined
  }

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

export const readEdgeRouteOrigin = (
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

const projectRouteDrag = ({
  ctx,
  session,
  input
}: {
  ctx: EdgeInteractionCtx
  session: EdgeRouteDragSession
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

const commitRouteDrag = ({
  ctx,
  session
}: {
  ctx: EdgeInteractionCtx
  session: EdgeRouteDragSession
}) => {
  if (
    readCapability(ctx, session.edgeId)?.editRoute
    && !isPointEqual(session.point, session.origin)
  ) {
    ctx.write.document.edge.route.move(session.edgeId, session.index, session.point)
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
  },
  control: InteractionControl
): InteractionSession => {
  let session: EdgeRouteDragSession = {
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
      session,
      input: pointer
    })
    if (!result.ok) {
      return CANCEL
    }

    if (result.session !== session) {
      session = result.session
      interaction!.gesture = createEdgeRouteGesture({
        start: {
          point: input.start,
          edgeId: session.edgeId,
          index: session.index
        },
        draft: {
          patches: [{
            id: session.edgeId,
            patch: result.patch,
            activeRouteIndex: session.index
          }]
        },
        meta: {}
      })
    }
  }

  interaction = {
    mode: 'edge-route',
    pointerId: session.pointerId,
    gesture: createEdgeRouteGesture({
      start: {
        point: input.start,
        edgeId: session.edgeId,
        index: session.index
      },
      draft: {
        patches: [{
          id: session.edgeId,
          activeRouteIndex: session.index
        }]
      },
      meta: {}
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
    cleanup: () => {}
  }

  return interaction
}
