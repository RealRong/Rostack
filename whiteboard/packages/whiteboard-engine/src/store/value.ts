import type { ValueStore } from '../types/store'

const isSameValue = <T,>(prev: T, next: T) => Object.is(prev, next)

export const createValueStore = <T,>(
  initial: T,
  {
    isEqual = isSameValue
  }: {
    isEqual?: (prev: T, next: T) => boolean
  } = {}
): ValueStore<T> => {
  let value = initial
  const listeners = new Set<() => void>()

  const notify = () => {
    Array.from(listeners).forEach((listener) => {
      listener()
    })
  }

  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next) => {
      if (isEqual(value, next)) {
        return
      }
      value = next
      notify()
    },
    update: (recipe) => {
      const next = recipe(value)
      if (isEqual(value, next)) {
        return
      }
      value = next
      notify()
    }
  }
}
