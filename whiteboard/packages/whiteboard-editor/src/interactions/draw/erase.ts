import { getSegmentBounds } from '@whiteboard/core/geometry'
import type {
  InteractionSession
} from '../../runtime/interaction'
import type {
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { PointerDownInput, PointerSample } from '../../types/input'
import type { InteractionCtx } from '../../runtime/interaction/ctx'

const ERASER_HIT_EPSILON_SCREEN = 2
const ZOOM_EPSILON = 0.0001

type DrawInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write'
>

type DrawPointer = {
  samples: readonly PointerSample[]
}

export type EraseSession = {
  ids: readonly NodeId[]
  lastWorld: Point
}

const readZoom = (
  ctx: DrawInteractionCtx
) => ctx.read.viewport.get().zoom

const queryDrawNodeIdsInRect = (
  ctx: DrawInteractionCtx,
  rect: Rect
): readonly NodeId[] => ctx.read.node.idsInRect(rect, {
  match: 'touch'
}).filter((nodeId) => (
  ctx.read.node.item.get(nodeId)?.node.type === 'draw'
))

const collectErasePoint = (
  ctx: DrawInteractionCtx,
  session: EraseSession,
  world: Point
): EraseSession => {
  const halfWorld =
    ERASER_HIT_EPSILON_SCREEN
    / Math.max(readZoom(ctx), ZOOM_EPSILON)
  const nodeIds = queryDrawNodeIdsInRect(
    ctx,
    getSegmentBounds(session.lastWorld, world, halfWorld)
  )
  const knownIds = new Set(session.ids)
  const nextIds = [...session.ids]

  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index]!
    if (knownIds.has(nodeId)) {
      continue
    }

    knownIds.add(nodeId)
    nextIds.push(nodeId)
  }

  const ids = nextIds.length === session.ids.length
    ? session.ids
    : nextIds

  return (
    ids === session.ids
    && session.lastWorld.x === world.x
    && session.lastWorld.y === world.y
  )
    ? session
    : {
        ...session,
        ids,
        lastWorld: world
      }
}

export const startEraseSession = (
  ctx: DrawInteractionCtx,
  input: PointerDownInput
): EraseSession | null => {
  const tool = ctx.read.tool.get()

  if (
    tool.type !== 'draw'
    || tool.kind !== 'eraser'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  return collectErasePoint(ctx, {
    ids: [],
    lastWorld: input.world
  }, input.world)
}

const stepEraseSession = (
  ctx: DrawInteractionCtx,
  session: EraseSession,
  input: DrawPointer
) => {
  let nextSession = session

  for (let index = 0; index < input.samples.length; index += 1) {
    nextSession = collectErasePoint(ctx, nextSession, input.samples[index]!.world)
  }

  return nextSession
}

const commitEraseSession = (
  ctx: DrawInteractionCtx,
  session: EraseSession
) => {
  if (session.ids.length > 0) {
    ctx.write.document.node.delete([...session.ids])
  }
}

export const createEraseInteractionSession = (
  ctx: DrawInteractionCtx,
  initial: EraseSession
): InteractionSession => {
  let session = initial

  if (session.ids.length > 0) {
    ctx.write.preview.draw.setHidden(session.ids)
  }

  const step = (
    input: DrawPointer
  ) => {
    const nextSession = stepEraseSession(ctx, session, input)
    if (nextSession.ids !== session.ids) {
      ctx.write.preview.draw.setHidden(nextSession.ids)
    }
    session = nextSession
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input)
      commitEraseSession(ctx, session)
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {
      ctx.write.preview.draw.clear()
    }
  }
}
