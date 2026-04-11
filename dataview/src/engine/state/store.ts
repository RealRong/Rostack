import {
  createValueStore
} from '@shared/store'
import type {
  State
} from './index'

export interface Store {
  get: () => State
  set: (next: State) => void
  update: (recipe: (previous: State) => State) => void
  sub: (fn: () => void) => () => void
}

export const createStore = (
  initial: State
): Store => {
  const store = createValueStore<State>({
    initial
  })

  return {
    get: store.get,
    set: store.set,
    update: store.update,
    sub: store.subscribe
  }
}
