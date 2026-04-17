import type { InteractionContext } from '@whiteboard/editor/input/core/context'
import type { InteractionBinding } from '@whiteboard/editor/input/core/types'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'

export const createEditorInteractions = (
  ctx: InteractionContext
): readonly InteractionBinding[] => ([
  createViewportBinding(ctx),
  createDrawBinding(ctx),
  createEdgeBinding(ctx),
  createTransformBinding(ctx),
  createSelectionBinding(ctx)
])
