import { store } from '@shared/core'
import type { HistoryPort } from './localHistory'
import type { Write } from './write'

export type HistoryBinding<
  Result,
  Op = any,
  Key = any,
  W extends Write<any, Op, Key, any> = Write<any, Op, Key, any>
> = HistoryPort<Result, Op, Key, W> & {
  set(next: HistoryPort<Result, Op, Key, W>): void
  reset(): void
}

export const createHistoryBinding = <
  Result,
  Op = any,
  Key = any,
  W extends Write<any, Op, Key, any> = Write<any, Op, Key, any>
>(
  initial: HistoryPort<Result, Op, Key, W>
): HistoryBinding<Result, Op, Key, W> => {
  const state = store.createValueStore(initial.get())
  let current = initial
  let unsubscribe = current.subscribe(() => {
    state.set(current.get())
  })

  const bind = (
    next: HistoryPort<Result, Op, Key, W>
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
    withPolicy: (policy) => current.withPolicy(policy),
    set: bind,
    reset: () => {
      bind(initial)
    }
  } as HistoryBinding<Result, Op, Key, W>
}
