import {
  createStagedKeyedStore,
  createStagedValueStore,
} from './staged'
import type {
  StagedKeyedStore,
  StagedValueStore
} from '../types/store'
import { createRafTask } from '../scheduler/raf'

type RafFallback = 'microtask' | 'sync'

export const createRafValueStore = <T,>({
  initial,
  isEqual,
  fallback = 'microtask'
}: {
  initial: T
  isEqual?: (left: T, right: T) => boolean
  fallback?: RafFallback
}): StagedValueStore<T> => {
  let schedule = () => {}

  const store = createStagedValueStore<T>({
    schedule: () => {
      schedule()
    },
    initial,
    isEqual
  })

  const task = createRafTask(() => {
    store.flush()
  }, { fallback })

  schedule = task.schedule

  return {
    get: store.get,
    subscribe: store.subscribe,
    write: store.write,
    clear: () => {
      task.cancel()
      store.clear()
    },
    flush: store.flush
  }
}

export const createRafKeyedStore = <Key, Value, Input>({
  emptyState,
  emptyValue,
  build,
  isEqual,
  fallback = 'microtask'
}: {
  emptyState: ReadonlyMap<Key, Value>
  emptyValue: Value
  build: (input: Input) => ReadonlyMap<Key, Value>
  isEqual?: (left: Value, right: Value) => boolean
  fallback?: RafFallback
}): StagedKeyedStore<Key, Value, Input> => {
  let schedule = () => {}

  const store = createStagedKeyedStore<Key, Value, Input>({
    schedule: () => {
      schedule()
    },
    emptyState,
    emptyValue,
    build,
    isEqual
  })

  const task = createRafTask(() => {
    store.flush()
  }, { fallback })

  schedule = task.schedule

  return {
    get: store.get,
    all: store.all,
    subscribe: store.subscribe,
    write: store.write,
    clear: () => {
      task.cancel()
      store.clear()
    },
    flush: store.flush
  }
}
