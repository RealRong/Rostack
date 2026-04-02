import type {
  InteractionControl,
  InteractionStartResult
} from '../../runtime/interaction'
import type { PointerDownInput } from '../../types/input'
import {
  resolveEdgePressPlan,
  startEdgePressPlan
} from './press'
import type { EdgeInteractionCtx } from './types'

export const startEdgeInteraction = (
  ctx: EdgeInteractionCtx,
  input: PointerDownInput,
  control: InteractionControl
): InteractionStartResult => {
  const plan = resolveEdgePressPlan(ctx, input)
  if (!plan) {
    return null
  }

  return startEdgePressPlan(ctx, input, plan, control)
}
