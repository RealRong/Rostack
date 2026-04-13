import type { ReadStore } from '@shared/core'
import type { ViewportRuntime } from '../viewport/runtime'
import { type ActiveGesture } from '../../input/core/gesture'
import { createOverlaySelectors } from './selectors'
import { createOverlayState } from './state'
import type { EditorOverlay } from './types'

export type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeOverlayEntry,
  EditorOverlay as EditorFeedbackRuntime,
  MindmapDragFeedback
} from './types'

export const createFeedback = ({
  viewport,
  gesture
}: {
  viewport: ViewportRuntime['read']
  gesture: Pick<ReadStore<ActiveGesture | null>, 'get' | 'subscribe'>
}): EditorOverlay => {
  const state = createOverlayState({
    gesture
  })
  const selectors = createOverlaySelectors({
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
