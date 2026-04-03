import type {
  InteractionStartResult
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import { startEdgeConnectInteraction } from './connect'
import { startEdgePress } from './press'
import { startEdgeRouteHandleInteraction } from './routePoint'
import type { EdgeInteractionCtx } from './types'

export const startEdgeInteraction = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput
): InteractionStartResult => {
  const route = startEdgeRouteHandleInteraction(ctx, input)
  if (route) {
    return route
  }

  const connect = startEdgeConnectInteraction(ctx, input)
  if (connect) {
    return connect
  }

  return startEdgePress(ctx, input)
}
