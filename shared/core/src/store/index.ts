import type { Equality } from '../equality'
import { batch } from './batch'
import { createDerivedStore } from './derived'
import { createKeyedDerivedStore } from './family'
import { createFamilyStore } from './familyStore'
import {
  createKeyedReadStore,
  createKeyedStore
} from './keyed'
import { joinUnsubscribes } from './listeners'
import {
  createProjectedKeyedStore,
  createProjectedStore
} from './projected'
import {
  peek,
  read
} from './read'
import { createStructStore } from './struct'
import type {
  KeyedReadStore,
  KeyedStore,
  ReadStore,
  StoreFamily,
  Unsubscribe,
  ValueStore
} from './types'
import { createReadStore, createValueStore } from './value'

type ReadableValueSpec<T> = {
  get: () => T
  subscribe: (listener: () => void) => () => void
  isEqual?: Equality<T>
}

type WritableKeyedSpec<Key, T> = {
  emptyValue: T
  initial?: ReadonlyMap<Key, T>
  isEqual?: Equality<T>
}

type ReadableKeyedSpec<Key, T> = {
  get: (key: Key) => T
  subscribe: (key: Key, listener: () => void) => () => void
  isEqual?: Equality<T>
}

const isReadableValueSpec = <T,>(
  value: unknown
): value is ReadableValueSpec<T> => (
  typeof value === 'object'
  && value !== null
  && 'get' in value
  && typeof value.get === 'function'
  && 'subscribe' in value
  && typeof value.subscribe === 'function'
)

const isWritableKeyedSpec = <Key, T>(
  value: unknown
): value is WritableKeyedSpec<Key, T> => (
  typeof value === 'object'
  && value !== null
  && 'emptyValue' in value
)

const isReadableKeyedSpec = <Key, T>(
  value: unknown
): value is ReadableKeyedSpec<Key, T> => (
  typeof value === 'object'
  && value !== null
  && 'get' in value
  && typeof value.get === 'function'
  && 'subscribe' in value
  && typeof value.subscribe === 'function'
)

export function value<T>(
  get: () => T,
  options?: {
    isEqual?: Equality<T>
  }
): ReadStore<T>
export function value<T>(
  spec: ReadableValueSpec<T>
): ReadStore<T>
export function value<T>(
  initial: T,
  options?: {
    isEqual?: Equality<T>
  }
): ValueStore<T>
export function value<T>(
  input: T | (() => T) | ReadableValueSpec<T>,
  options?: {
    isEqual?: Equality<T>
  }
): ReadStore<T> | ValueStore<T> {
  if (typeof input === 'function') {
    return createDerivedStore({
      get: input as () => T,
      ...(options?.isEqual
        ? {
            isEqual: options.isEqual
          }
        : {})
    })
  }

  if (isReadableValueSpec<T>(input)) {
    return createReadStore(input)
  }

  return createValueStore(input, options)
}

export function keyed<Key, T>(
  get: (key: Key) => T,
  options?: {
    isEqual?: Equality<T>
    keyOf?: (key: Key) => unknown
  }
): KeyedReadStore<Key, T>
export function keyed<Key, T>(
  spec: ReadableKeyedSpec<Key, T>
): KeyedReadStore<Key, T>
export function keyed<Key, T>(
  options: WritableKeyedSpec<Key, T>
): KeyedStore<Key, T>
export function keyed<Key, T>(
  input: WritableKeyedSpec<Key, T> | ((key: Key) => T) | ReadableKeyedSpec<Key, T>,
  options?: {
    isEqual?: Equality<T>
    keyOf?: (key: Key) => unknown
  }
): KeyedStore<Key, T> | KeyedReadStore<Key, T> {
  if (typeof input === 'function') {
    return createKeyedDerivedStore({
      get: input as (key: Key) => T,
      ...(options?.isEqual
        ? {
            isEqual: options.isEqual
          }
        : {}),
      ...(options?.keyOf
        ? {
            keyOf: options.keyOf
          }
        : {})
    })
  }

  if (isReadableKeyedSpec<Key, T>(input)) {
    return createKeyedReadStore(input)
  }

  if (isWritableKeyedSpec<Key, T>(input)) {
    return createKeyedStore(input)
  }

  throw new Error('Invalid store.keyed() input.')
}

export const family = <Key, Value>(options?: {
  initial?: StoreFamily<Key, Value>
  isEqual?: Equality<Value>
}) => createFamilyStore(options)

export const projected = createProjectedStore
export const projectedKeyed = createProjectedKeyedStore
export const combine = createStructStore
export const join = (
  unsubscribes: readonly Unsubscribe[]
): Unsubscribe => joinUnsubscribes(unsubscribes)

export type * from './types'
export {
  batch,
  peek,
  read
}
