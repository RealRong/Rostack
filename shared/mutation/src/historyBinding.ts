import { store } from '@shared/core'
import type { LocalHistoryApi } from './localHistory'

export type LocalHistoryBinding<Result> = LocalHistoryApi<Result> & {
  set(next: LocalHistoryApi<Result>): void
  reset(): void
}

export const createLocalHistoryBinding = <Result>(
  initial: LocalHistoryApi<Result>
): LocalHistoryBinding<Result> => {
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
