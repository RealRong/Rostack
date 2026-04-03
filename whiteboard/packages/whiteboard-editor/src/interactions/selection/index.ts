import type {
  InteractionBinding,
  InteractionCtx
} from '../../runtime/interaction'
import { startSelectionPress } from './press'

type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export const createSelectionInteraction = (
  ctx: SelectionInteractionCtx
): InteractionBinding => ({
  key: 'selection',
  start: (input) => startSelectionPress(ctx, input)
})
