import type {
  InteractionBinding
} from '../../runtime/interaction/types'
import type { InteractionContext } from '../context'
import { startSelectionPress } from './press'

type SelectionInteractionCtx = Pick<
  InteractionContext,
  'read' | 'write' | 'config' | 'snap'
>

export const createSelectionInteraction = (
  ctx: SelectionInteractionCtx
): InteractionBinding => ({
  key: 'selection',
  start: (input) => startSelectionPress(ctx, input)
})
