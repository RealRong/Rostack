import type { ReadStore } from '@shared/core'
import type { EditorViewportRuntime } from '../editor/types'
import { type ActiveGesture } from '../interaction/gesture'
import { createOverlaySelectors } from './selectors'
import { createOverlayState } from './state'
import type { EditorOverlay } from './types'

export type {
  EdgeConnectFeedback,
  EdgeGuide,
  EdgeOverlayEntry,
  EditorOverlay,
  MindmapDragFeedback
} from './types'

export const createOverlay = ({
  viewport,
  gesture
}: {
  viewport: EditorViewportRuntime['read']
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
