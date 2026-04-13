import { getSegmentBounds } from '@whiteboard/core/geometry'
import type {
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { PointerDownInput, PointerSample } from '../../../types/input'
import type { InteractionContext } from '../../context'

const ERASER_HIT_EPSILON_SCREEN = 2
const ZOOM_EPSILON = 0.0001

type DrawPointer = {
  samples: readonly PointerSample[]
}

export type EraseState = {
  ids: readonly NodeId[]
  lastWorld: Point
}

const queryDrawNodeIdsInRect = (
  ctx: InteractionContext,
  rect: Rect
): readonly NodeId[] => ctx.query.node.idsInRect(rect, {
  match: 'touch'
}).filter((nodeId) => (
  ctx.query.node.item.get(nodeId)?.node.type === 'draw'
))

const collectErasePoint = (
  ctx: InteractionContext,
  state: EraseState,
  world: Point
): EraseState => {
  const halfWorld =
    ERASER_HIT_EPSILON_SCREEN
    / Math.max(ctx.query.viewport.get().zoom, ZOOM_EPSILON)
  const nodeIds = queryDrawNodeIdsInRect(
    ctx,
    getSegmentBounds(state.lastWorld, world, halfWorld)
  )
  const knownIds = new Set(state.ids)
  const nextIds = [...state.ids]

  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index]!
    if (knownIds.has(nodeId)) {
      continue
    }

    knownIds.add(nodeId)
    nextIds.push(nodeId)
  }

  const ids = nextIds.length === state.ids.length
    ? state.ids
    : nextIds

  return (
    ids === state.ids
    && state.lastWorld.x === world.x
    && state.lastWorld.y === world.y
  )
    ? state
    : {
        ...state,
        ids,
        lastWorld: world
      }
}

export const startEraseState = (
  ctx: InteractionContext,
  input: PointerDownInput
): EraseState | null => {
  const tool = ctx.query.tool.get()

  if (
    tool.type !== 'draw'
    || tool.mode !== 'eraser'
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

export const stepEraseState = (
  ctx: InteractionContext,
  state: EraseState,
  input: DrawPointer
) => {
  let nextState = state

  for (let index = 0; index < input.samples.length; index += 1) {
    nextState = collectErasePoint(ctx, nextState, input.samples[index]!.world)
  }

  return nextState
}

export const commitEraseState = (
  ctx: InteractionContext,
  state: EraseState
) => {
  if (state.ids.length > 0) {
    ctx.command.node.delete([...state.ids])
  }
}
