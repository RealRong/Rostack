import type {
  InteractionBinding,
  InteractionCtx
} from '../../runtime/interaction'
import { createPressInteraction, resolveSelectionPressPlan } from './press'

type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export const createSelectionInteraction = (
  ctx: SelectionInteractionCtx
): InteractionBinding => ({
  key: 'selection',
  start: (input, control) => {
    const plan = resolveSelectionPressPlan(ctx, input)
    return plan
      ? createPressInteraction(ctx, input, plan, control)
      : null
  }
})
