import type {
  InteractionBinding
} from '../../runtime/interaction/types'
import type { InteractionContext } from '../context'
import { startSelectionPress } from './press'

export const createSelectionInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'selection',
  start: (input) => startSelectionPress(ctx, input)
})
