import type { EdgeId } from '@whiteboard/core/types'
import type {
  InteractionStartResult
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import { createEdgeBodyMoveSession } from './move'
import type { EdgeInteractionCtx } from './types'

const selectEdge = (
  ctx: EdgeInteractionCtx,
  edgeId: EdgeId
) => {
  ctx.write.session.selection.replace({
    edgeIds: [edgeId]
  })
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

const resolveEdgeBodyPress = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput
): EdgeId | null => {
  if (ctx.read.tool.get().type !== 'select') {
    return null
  }

  if (
    input.pick.kind === 'edge'
    && input.pick.part === 'body'
  ) {
    return input.pick.id
  }
  return null
}

const startEdgeBodyMove = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput,
  edgeId: EdgeId
): InteractionStartResult | null => {
  if (!readCapability(ctx, edgeId)?.move) {
    return null
  }

  selectEdge(ctx, edgeId)
  return createEdgeBodyMoveSession(ctx, {
    edgeId,
    pointerId: start.pointerId,
    start: start.world
  })
}

export const startEdgePress = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput
): InteractionStartResult | null => {
  const edgeId = resolveEdgeBodyPress(ctx, start)
  if (!edgeId) {
    return null
  }

  return startEdgeBodyMove(ctx, start, edgeId)
}
