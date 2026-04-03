import type { InteractionBinding } from '../../runtime/interaction'
import { startEdgeInteraction } from './start'
import type { EdgeInteractionCtx } from './types'

export const createEdgeInteraction = (
  ctx: EdgeInteractionCtx
): InteractionBinding => ({
  key: 'edge',
  start: (input) => startEdgeInteraction(ctx, input)
})
