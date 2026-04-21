import { store as coreStore } from '@shared/core'
import type { EdgeGuide } from '@whiteboard/editor/session/preview/types'

export type HoverState = {
  edgeGuide?: EdgeGuide
}

export type HoverStore = Pick<coreStore.ReadStore<HoverState>, 'get' | 'subscribe'> & {
  set: (
    next:
      | HoverState
      | ((current: HoverState) => HoverState)
  ) => void
  reset: () => void
}

const EMPTY_HOVER_STATE: HoverState = {}

export const createHoverStore = (): HoverStore => {
  const hoverStore = coreStore.createValueStore<HoverState>(EMPTY_HOVER_STATE)
  let current = EMPTY_HOVER_STATE

  return {
    get: hoverStore.get,
    subscribe: hoverStore.subscribe,
    set: (next) => {
      current = typeof next === 'function'
        ? next(current)
        : next
      hoverStore.set(current)
    },
    reset: () => {
      current = EMPTY_HOVER_STATE
      hoverStore.set(EMPTY_HOVER_STATE)
    }
  }
}
