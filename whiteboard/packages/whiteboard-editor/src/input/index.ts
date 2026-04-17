import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { InteractionBinding } from '@whiteboard/editor/input/types'
import { createDrawBinding } from '@whiteboard/editor/input/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/edge'
import { createSelectionBinding } from '@whiteboard/editor/input/selection/press'
import { createTransformBinding } from '@whiteboard/editor/input/transform'
import { createViewportBinding } from '@whiteboard/editor/input/viewport'

export const createEditorInteractions = (
  ctx: InteractionContext
): readonly InteractionBinding[] => ([
  createViewportBinding(ctx),
  createDrawBinding(ctx),
  createEdgeBinding(ctx),
  createTransformBinding(ctx),
  createSelectionBinding(ctx)
])
