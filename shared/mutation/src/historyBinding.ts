import { store } from '@shared/core'
import type { HistoryPort } from './localHistory'

export type HistoryBinding<Result> = HistoryPort<Result> & {
  set(next: HistoryPort<Result>): void
  reset(): void
}

export const createHistoryBinding = <Result>(
  initial: HistoryPort<Result>
): HistoryBinding<Result> => {
  const state = store.createValueStore(initial.get())
  let current = initial
  let unsubscribe = current.subscribe(() => {
    state.set(current.get())
  })

  const bind = (
    next: HistoryPort<Result>
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
