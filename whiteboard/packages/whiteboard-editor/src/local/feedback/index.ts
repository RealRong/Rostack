import type { ReadStore } from '@shared/core'
import type { ViewportRuntime } from '../viewport/runtime'
import { type ActiveGesture } from '../../input/core/gesture'
import { createFeedbackSelectors } from './selectors'
import { createFeedbackState } from './state'
import type { EditorFeedbackRuntime } from './types'

export type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeFeedbackEntry,
  EditorFeedbackRuntime,
  MindmapDragFeedback
} from './types'

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
