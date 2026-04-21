import { store } from '@shared/core'
import { useSyncExternalStore } from 'react'

const subscribeNever = (
  _listener: () => void
) => () => {}

export const useStoreValue = <T,>(
  store: store.ReadStore<T>
): T => useSyncExternalStore(
  store.subscribe,
  store.get,
  store.get
)

export const useKeyedStoreValue = <Key, T,>(
  store: store.KeyedReadStore<Key, T>,
  key: Key
): T => useSyncExternalStore(
  listener => store.subscribe(key, listener),
  () => store.get(key),
  () => store.get(key)
)

export const useOptionalKeyedStoreValue = <Key, T,>(
  store: store.KeyedReadStore<Key, T>,
  key: Key | undefined,
  emptyValue: T
): T => useSyncExternalStore(
  key === undefined
    ? subscribeNever
    : listener => store.subscribe(key, listener),
  () => key === undefined
    ? emptyValue
    : store.get(key),
  () => key === undefined
    ? emptyValue
    : store.get(key)
)
