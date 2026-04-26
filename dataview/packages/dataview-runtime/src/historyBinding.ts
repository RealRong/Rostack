import { store } from '@shared/core'
import type { LocalHistoryApi } from '@shared/mutation'

export type HistoryBinding<Result> = LocalHistoryApi<Result> & {
  set(next: LocalHistoryApi<Result>): void
  reset(): void
}

export const createHistoryBinding = <Result>(
  initial: LocalHistoryApi<Result>
): HistoryBinding<Result> => {
  const state = store.createValueStore(initial.get())
  let current = initial
  let unsubscribe = current.subscribe(() => {
    state.set(current.get())
  })

  const bind = (
    next: LocalHistoryApi<Result>
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
