import {
  createDerivedStore,
  createValueStore,
  read,
  type Equality,
  type ReadStore,
  type ValueStore
} from '@shared/core'

export const createControllerStore = <T,>(options: {
  initial: T
  isEqual?: Equality<T>
}): {
  store: ValueStore<T>
  get: () => T
} => {
  const store = createValueStore<T>(options)

  return {
    store,
    get: store.get
  }
}

export const createNullableControllerStore = <T,>(options?: {
  initial?: T | null
  isEqual?: Equality<T | null>
}): {
  store: ValueStore<T | null>
  get: () => T | null
  clear: () => void
  openStore: ReadStore<boolean>
} => {
  const store = createValueStore<T | null>({
    initial: options?.initial ?? null,
    ...(options?.isEqual
      ? {
          isEqual: options.isEqual
        }
      : {})
  })

  return {
    store,
    get: store.get,
    clear: () => {
      store.set(null)
    },
    openStore: createDerivedStore<boolean>({
      get: () => Boolean(read(store))
    })
  }
}

export const createListenerSet = <T,>() => {
  const listeners = new Set<(value: T) => void>()

  return {
    emit: (value: T) => {
      Array.from(listeners).forEach(listener => {
        listener(value)
      })
    },
    subscribe: (listener: (value: T) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
