import type {
  InteractionBinding,
  InteractionStartResult
} from '../../runtime/interaction/types'
import type { PointerDownInput } from '../../types/input'
import { startEdgeConnectInteraction } from './connect'
import { startEdgePress } from './press'
import { startEdgeRouteHandleInteraction } from './routePoint'
import type { EdgeInteractionCtx } from './types'

const startEdgeInteraction = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput
): InteractionStartResult => {
  for (const start of [
    startEdgeRouteHandleInteraction,
    startEdgeConnectInteraction,
    startEdgePress
  ] as const) {
    const result = start(ctx, input)
    if (result) {
      return result
    }
  }

  return null
}

export const createEdgeInteraction = (
  ctx: EdgeInteractionCtx
): InteractionBinding => ({
  key: 'edge',
  start: (input) => startEdgeInteraction(ctx, input)
})
