import type { ReadStore } from '@shared/core'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'
import { type ActiveGesture } from '@whiteboard/editor/input/core/gesture'
import type { HoverStore } from '@whiteboard/editor/input/hover/store'
import { createInputPreviewSelectors } from '@whiteboard/editor/input/preview/selectors'
import { createInputPreviewState } from '@whiteboard/editor/input/preview/state'
import type {
  EditorInputPreview,
  EditorInputPreviewWrite
} from '@whiteboard/editor/input/preview/types'

export type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeFeedbackEntry,
  EditorInputPreview,
  EditorInputPreviewState,
  EditorInputPreviewWrite,
  MindmapPreviewState
} from '@whiteboard/editor/input/preview/types'

export const createEditorInputPreview = ({
  viewport,
  gesture,
  hover
}: {
  viewport: ViewportRuntime['read']
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
}): EditorInputPreview => {
  const state = createInputPreviewState({
    gesture,
    hover
  })
  const selectors = createInputPreviewSelectors({
    state,
    viewport
  })
  const write: EditorInputPreviewWrite = {
    set: state.set,
    reset: state.reset
  }

  return {
    selectors,
    write
  }
}
