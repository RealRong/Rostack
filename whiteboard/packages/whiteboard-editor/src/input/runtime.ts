import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { EdgeGuidePreview } from '@whiteboard/editor-scene'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import { createEdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import {
  composeEditorPreviewState,
  isPreviewEqual,
  readPersistentPreviewState
} from '@whiteboard/editor/preview/state'
import type { EditorInputHost, Editor } from '@whiteboard/editor/types/editor'

export type EditorInputContext = {
  editor: Editor
  layout: WhiteboardLayoutService
}

export type EditorInputRuntimeHost = EditorInputHost

export const createEditorHost = (
  input: EditorInputContext
): EditorInputRuntimeHost => {
  let gesture: import('@whiteboard/editor/input/core/gesture').ActiveGesture | null = null
  let edgeGuide: EdgeGuidePreview | undefined

  const syncPreview = () => {
    const basePreview = readPersistentPreviewState(
      input.editor.read().overlay.preview
    )
    const nextPreview = composeEditorPreviewState({
      base: basePreview,
      gesture,
      edgeGuide,
      readDocument: input.editor.document.snapshot
    })
    const current = input.editor.read().overlay.preview
    if (isPreviewEqual(current, nextPreview)) {
      return
    }

    input.editor.dispatch({
      type: 'overlay.preview.set',
      preview: nextPreview
    })
  }

  const interaction = createInteractionRuntime({
    getViewport: () => ({
      screenPoint: input.editor.runtime.viewport.screenPoint,
      size: input.editor.runtime.viewport.size,
      panScreenBy: (deltaScreen) => {
        input.editor.actions.viewport.panScreenBy(deltaScreen)
      }
    }),
    getBindings: () => ([
      createViewportBinding(input),
      createDrawBinding(input),
      createEdgeBinding(input),
      createTransformBinding(input),
      createSelectionBinding(input)
    ]),
    state: {
      readInteraction: () => ({
        mode: input.editor.read().state.interaction.mode,
        chrome: input.editor.read().state.interaction.chrome,
        space: input.editor.read().state.interaction.space,
        hover: input.editor.read().overlay.hover
      }),
      dispatch: input.editor.dispatch,
      setGesture: (nextGesture) => {
        gesture = nextGesture
        syncPreview()
      },
      getSpace: () => input.editor.read().state.interaction.space
    }
  })

  const edgeHover = createEdgeHoverService(
    {
      readTool: () => input.editor.read().state.tool,
      snap: input.editor.runtime.snap
    },
    {
      read: () => edgeGuide,
      write: (nextEdgeGuide) => {
        edgeGuide = nextEdgeGuide
        syncPreview()
      }
    }
  )

  return createEditorInputHost({
    editor: input.editor,
    interaction,
    edgeHover
  })
}
