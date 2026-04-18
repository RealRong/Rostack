import type { Equality } from '../equality'
import {
  batch,
  queueListeners
} from './batch'
import {
  notifyListeners
} from './listeners'
import {
  guardPlainGet
} from './read'
import {
  INTERNAL_SUBSCRIBE,
  type InternalReadStore
} from './runtime'
import type {
  ReadStore,
  ValueStore
} from './types'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

export const createReadStore = <T,>(
  options: {
    get: () => T
    subscribe: (listener: () => void) => () => void
    isEqual?: Equality<T>
  }
): ReadStore<T> => ({
  get: guardPlainGet(options.get),
  subscribe: options.subscribe,
  [INTERNAL_SUBSCRIBE]: options.subscribe,
  ...(options.isEqual ? { isEqual: options.isEqual } : {})
}) as InternalReadStore<T>

export function createValueStore<T>(
  options: {
    initial: T
    isEqual?: Equality<T>
  }
): ValueStore<T>
export function createValueStore<T>(
  initial: T,
  options?: {
    isEqual?: Equality<T>
  }
): ValueStore<T>
export function createValueStore<T>(
  initialOrOptions: T | {
    initial: T
    isEqual?: Equality<T>
  },
  maybeOptions?: {
    isEqual?: Equality<T>
  }
): ValueStore<T> {
  const initial = (
    typeof initialOrOptions === 'object'
    && initialOrOptions !== null
    && 'initial' in initialOrOptions
  )
    ? initialOrOptions.initial
    : initialOrOptions as T
  const isEqual = (
    typeof initialOrOptions === 'object'
    && initialOrOptions !== null
    && 'initial' in initialOrOptions
      ? initialOrOptions.isEqual
      : maybeOptions?.isEqual
  ) ?? sameValue

  let current = initial
  const publicListeners = new Set<() => void>()
  const internalListeners = new Set<() => void>()

  const publish = () => {
    batch(() => {
      notifyListeners(internalListeners)
      queueListeners(publicListeners)
    })
  }

  const set = (
    next: T
  ) => {
    if (isEqual(current, next)) {
      return
    }

    current = next
    publish()
  }

  return {
    get: guardPlainGet(() => current),
    subscribe: listener => {
      publicListeners.add(listener)
      return () => {
        publicListeners.delete(listener)
      }
    },
    [INTERNAL_SUBSCRIBE]: (listener: () => void) => {
      internalListeners.add(listener)
      return () => {
        internalListeners.delete(listener)
      }
    },
    set,
    update: recipe => set(recipe(current)),
    isEqual
  } as ValueStore<T> & InternalReadStore<T>
}
