import type { EditorInputHost } from '@whiteboard/editor/types/editor'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import {
  createEdgeHoverService,
  type EdgeHoverService
} from '@whiteboard/editor/input/hover/edge'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import type {
  EditorInputState,
  EditorInputStateController
} from '@whiteboard/editor/input/state'
import type { EditorInputPreview } from '@whiteboard/editor/input/preview'
import type { EditorServices } from '@whiteboard/editor/editor/services'

export type EditorInputRuntime = {
  state: EditorInputState
  preview: EditorInputPreview
  host: EditorInputHost
  reset: () => void
}

export const createEditorInput = ({
  state,
  preview,
  ...services
}: Omit<EditorServices, 'input'> & {
  state: EditorInputStateController
  preview: EditorInputPreview
}): EditorInputRuntime => {
  const interaction = createInteractionRuntime({
    getViewport: () => services.local.viewport.input,
    getBindings: () => ([
      createViewportBinding(services),
      createDrawBinding(services),
      createEdgeBinding(services),
      createTransformBinding(services),
      createSelectionBinding(services)
    ]),
    state
  })
  const edgeHover = createEdgeHoverService(
    services,
    state.hover
  )
  const host = createEditorInputHost({
    interaction,
    state,
    edgeHover,
    query: services.query,
    local: services.local,
    actions: services.actions
  })

  return {
    state: state.state,
    preview,
    host,
    reset: () => {
      edgeHover.clear()
      interaction.cancel()
      state.reset()
      preview.write.reset()
    }
  }
}
