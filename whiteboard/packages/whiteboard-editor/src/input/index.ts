import type { InteractionContext } from '#whiteboard-editor/input/context'
import type { InteractionBinding } from '#whiteboard-editor/input/core/types'
import { createDrawInteraction } from '#whiteboard-editor/input/draw'
import { createEdgeInteraction } from '#whiteboard-editor/input/edge/start'
import { createMindmapInteraction } from '#whiteboard-editor/input/mindmap'
import { createSelectionInteraction } from '#whiteboard-editor/input/selection'
import { createTransformInteraction } from '#whiteboard-editor/input/transform/start'
import { createViewportInteraction } from '#whiteboard-editor/input/viewport/session'

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
