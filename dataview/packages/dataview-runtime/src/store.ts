import { equal, store as coreStore } from '@shared/core'


export const createControllerStore = <T,>(options: {
  initial: T
  isEqual?: equal.Equality<T>
}): {
  store: coreStore.ValueStore<T>
  get: () => T
} => {
  const stateStore = coreStore.createValueStore<T>(options)

  return {
    store: stateStore,
    get: stateStore.get
  }
}

export const createNullableControllerStore = <T,>(options?: {
  initial?: T | null
  isEqual?: equal.Equality<T | null>
}): {
  store: coreStore.ValueStore<T | null>
  get: () => T | null
  clear: () => void
  openStore: coreStore.ReadStore<boolean>
} => {
  const stateStore = coreStore.createValueStore<T | null>({
    initial: options?.initial ?? null,
    ...(options?.isEqual
      ? {
          isEqual: options.isEqual
        }
      : {})
  })

  return {
    store: stateStore,
    get: stateStore.get,
    clear: () => {
      stateStore.set(null)
    },
    openStore: coreStore.createDerivedStore<boolean>({
      get: () => Boolean(coreStore.read(stateStore))
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
