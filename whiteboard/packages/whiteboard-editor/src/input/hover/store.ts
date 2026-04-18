import { createValueStore, type ReadStore } from '@shared/core'
import type { EdgeGuide } from '@whiteboard/editor/session/preview/types'

export type HoverState = {
  edgeGuide?: EdgeGuide
}

export type HoverStore = Pick<ReadStore<HoverState>, 'get' | 'subscribe'> & {
  set: (
    next:
      | HoverState
      | ((current: HoverState) => HoverState)
  ) => void
  reset: () => void
}

const EMPTY_HOVER_STATE: HoverState = {}

export const createHoverStore = (): HoverStore => {
  const store = createValueStore<HoverState>(EMPTY_HOVER_STATE)
  let current = EMPTY_HOVER_STATE

  return {
    get: store.get,
    subscribe: store.subscribe,
    set: (next) => {
      current = typeof next === 'function'
        ? next(current)
        : next
      store.set(current)
    },
    reset: () => {
      current = EMPTY_HOVER_STATE
      store.set(EMPTY_HOVER_STATE)
    }
  }
}
