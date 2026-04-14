import type {
  InteractionBinding
} from '@whiteboard/editor/input/core/types'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import { startSelectionPress } from '@whiteboard/editor/input/selection/press/session'

export const createSelectionInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'selection',
  start: (input) => startSelectionPress(ctx, input)
})
