import type { InteractionContext } from './context'
import type { InteractionBinding } from './core/types'
import { createDrawInteraction } from './draw'
import { createEdgeInteraction } from './edge/start'
import { createMindmapInteraction } from './mindmap'
import { createSelectionInteraction } from './selection'
import { createTransformInteraction } from './transform/start'
import { createViewportInteraction } from './viewport/session'

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
