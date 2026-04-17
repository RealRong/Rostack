import type { ReadStore } from '@shared/core'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'
import { type ActiveGesture } from '@whiteboard/editor/input/gesture'
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
  gesture
}: {
  viewport: ViewportRuntime['read']
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
}): EditorFeedbackRuntime => {
  const state = createFeedbackState({
    gesture
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
