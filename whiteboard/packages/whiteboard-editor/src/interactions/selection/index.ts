import type {
  InteractionBinding,
  InteractionCtx
} from '../../runtime/interaction'
import { createPressInteraction, resolveSelectionPressState } from './press'

type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export const createSelectionInteraction = (
  ctx: SelectionInteractionCtx
): InteractionBinding => ({
  key: 'selection',
  start: (input, control) => {
    const state = resolveSelectionPressState(ctx, input)
    return state
      ? createPressInteraction(ctx, input, state, control)
      : null
  }
})
