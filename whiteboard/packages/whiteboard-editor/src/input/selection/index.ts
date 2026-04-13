import type {
  InteractionBinding
} from '../core/types'
import type { InteractionContext } from '../context'
import { startSelectionPress } from './press/session'

export const createSelectionInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'selection',
  start: (input) => startSelectionPress(ctx, input)
})
