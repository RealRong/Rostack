import { createValueStore } from '@shared/core'
import type {
  HistoryApi,
  HistoryBinding
} from '@whiteboard/history/types'

export const createHistoryBinding = (
  initial: HistoryApi
): HistoryBinding => {
  const state = createValueStore(initial.get())
  let current = initial
  let unsubscribe = current.subscribe(() => {
    state.set(current.get())
  })

  const bind = (
    next: HistoryApi
  ) => {
    unsubscribe()
    current = next
    state.set(current.get())
    unsubscribe = current.subscribe(() => {
      state.set(current.get())
    })
  }

  return {
    get: state.get,
    subscribe: state.subscribe,
    undo: () => current.undo(),
    redo: () => current.redo(),
    clear: () => current.clear(),
    set: bind,
    reset: () => {
      bind(initial)
    }
  }
}
