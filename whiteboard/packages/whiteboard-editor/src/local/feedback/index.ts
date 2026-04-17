import type { ReadStore } from '@shared/core'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'
import { type ActiveGesture } from '@whiteboard/editor/input/core/gesture'
import type { HoverStore } from '@whiteboard/editor/input/hover/store'
import { createFeedbackSelectors } from '@whiteboard/editor/local/feedback/selectors'
import { createFeedbackState } from '@whiteboard/editor/local/feedback/state'
import type { EditorFeedbackRuntime } from '@whiteboard/editor/local/feedback/types'

export type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeFeedbackEntry,
  EditorFeedbackRuntime,
  MindmapPreviewState
} from '@whiteboard/editor/local/feedback/types'

export const createFeedback = ({
  viewport,
  gesture,
  hover
}: {
  viewport: ViewportRuntime['read']
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
  hover: Pick<HoverStore, 'get' | 'subscribe'>
}): EditorFeedbackRuntime => {
  const state = createFeedbackState({
    gesture,
    hover
  })
  const selectors = createFeedbackSelectors({
    state,
    viewport
  })

  return {
    get: state.get,
    subscribe: state.subscribe,
    set: state.set,
    reset: state.reset,
    selectors
  }
}
