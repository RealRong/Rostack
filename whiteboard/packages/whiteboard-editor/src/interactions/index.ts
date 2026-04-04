import type { InteractionContext } from './context'
import type { InteractionBinding } from '../runtime/interaction/types'
import { createDrawInteraction } from './draw'
import { createEdgeInteraction } from './edge'
import { createMindmapInteraction } from './mindmap'
import { createSelectionInteraction } from './selection'
import { createTransformInteraction } from './transform'
import { createViewportInteraction } from './viewport'

export const createEditorInteractions = (
  ctx: InteractionContext
): readonly InteractionBinding[] => ([
  createViewportInteraction(ctx),
  createDrawInteraction(ctx),
  createEdgeInteraction(ctx),
  createTransformInteraction(ctx),
  createMindmapInteraction(ctx),
  createSelectionInteraction(ctx)
])
