import type {
  KeyedReadStore,
  ReadStore
} from './types'
import {
  getStoreRuntime
} from './runtime'
import {
  NO_KEY
} from './deps'

let plainGetAccessDepth = 0

const runWithPlainGetAccess = <T,>(
  fn: () => T
): T => {
  plainGetAccessDepth += 1

  try {
    return fn()
  } finally {
    plainGetAccessDepth -= 1
  }
}

const assertPlainGetAllowed = () => {
  const runtime = getStoreRuntime()
  if (runtime.activeFrame === null || plainGetAccessDepth > 0) {
    return
  }

  throw new Error(
    'Do not call store.get() inside a derived computation. Use read(store) instead.'
  )
}

export const guardPlainGet = <T,>(
  get: () => T
) => () => {
  assertPlainGetAllowed()
  return get()
}

export const guardPlainKeyedGet = <K, T>(
  get: (key: K) => T
) => (key: K) => {
  assertPlainGetAllowed()
  return get(key)
}

export function peek<T>(
  store: ReadStore<T>
): T
export function peek<K, T>(
  store: KeyedReadStore<K, T>,
  key: K
): T
export function peek<K, T>(
  store: ReadStore<T> | KeyedReadStore<K, T>,
  key?: K
): T {
  return key === undefined
    ? runWithPlainGetAccess(() => (store as ReadStore<T>).get())
    : runWithPlainGetAccess(() => (store as KeyedReadStore<K, T>).get(key))
}

export function read<T>(
  store: ReadStore<T>
): T
export function read<K, T>(
  store: KeyedReadStore<K, T>,
  key: K
): T
export function read<K, T>(
  store: ReadStore<T> | KeyedReadStore<K, T>,
  key?: K
): T {
  const activeFrame = getStoreRuntime().activeFrame
  if (activeFrame?.track) {
    activeFrame.track(store, key === undefined ? NO_KEY : key)
  }

  return key === undefined
    ? runWithPlainGetAccess(() => (store as ReadStore<T>).get())
    : runWithPlainGetAccess(() => (store as KeyedReadStore<K, T>).get(key))
}
