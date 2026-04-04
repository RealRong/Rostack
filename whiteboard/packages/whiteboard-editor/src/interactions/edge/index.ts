import type {
  InteractionBinding
} from '../../runtime/interaction/types'
import type { InteractionContext } from '../context'
import { startEdgeConnectInteraction } from './connect'
import { startEdgePress } from './press'
import { startEdgeRouteHandleInteraction } from './routePoint'

export const createEdgeInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'edge',
  start: (input) => {
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
})
