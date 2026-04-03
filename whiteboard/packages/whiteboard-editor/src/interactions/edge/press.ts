import type {
  InteractionStartResult
} from '../../runtime/interaction/types'
import type { PointerDownInput } from '../../types/input'
import { createEdgeBodyMoveSession } from './move'
import type { EdgeInteractionCtx } from './types'

const readCapability = (
  ctx: EdgeInteractionCtx,
  edgeId: string
) => {
  const item = ctx.read.edge.item.get(edgeId)
  return item
    ? ctx.read.edge.capability(item.edge)
    : undefined
}

export const startEdgePress = (
  ctx: EdgeInteractionCtx,
  start: PointerDownInput
): InteractionStartResult | null => {
  if (ctx.read.tool.get().type !== 'select') {
    return null
  }

  if (
    start.pick.kind !== 'edge'
    || start.pick.part !== 'body'
  ) {
    return null
  }

  const edgeId = start.pick.id
  if (!readCapability(ctx, edgeId)?.move) {
    return null
  }

  ctx.write.session.selection.replace({
    edgeIds: [edgeId]
  })

  return createEdgeBodyMoveSession(ctx, {
    edgeId,
    pointerId: start.pointerId,
    start: start.world
  })
}
