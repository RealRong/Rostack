import type { Equality } from '../equality'
import {
  createFrameTask
} from '../frame'
import {
  createStagedKeyedStore,
  createStagedValueStore
} from './staged'
import type {
  StagedKeyedStore,
  StagedValueStore
} from './types'

type FrameFallback = 'microtask' | 'sync'

export const createFrameValueStore = <T,>({
  initial,
  isEqual,
  fallback = 'microtask'
}: {
  initial: T
  isEqual?: Equality<T>
  fallback?: FrameFallback
}): StagedValueStore<T> => {
  let schedule = () => {}

  const store = createStagedValueStore<T>({
    schedule: () => {
      schedule()
    },
    initial,
    isEqual
  })

  const task = createFrameTask(() => {
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
    flush: store.flush,
    isEqual: store.isEqual
  }
}

export const createFrameKeyedStore = <Key, Value, Input>({
  emptyState,
  emptyValue,
  build,
  isEqual,
  fallback = 'microtask'
}: {
  emptyState: ReadonlyMap<Key, Value>
  emptyValue: Value
  build: (input: Input) => ReadonlyMap<Key, Value>
  isEqual?: Equality<Value>
  fallback?: FrameFallback
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

  const task = createFrameTask(() => {
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
    flush: store.flush,
    isEqual: store.isEqual
  }
}
