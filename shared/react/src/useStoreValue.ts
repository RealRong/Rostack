import type { KeyedReadStore, ReadStore } from '@shared/core'
import { useExternalValue } from '@shared/react/useExternalValue'

export const useStoreValue = <T,>(
  store: ReadStore<T>
): T => useExternalValue(
  store.subscribe,
  store.get,
  store.isEqual ?? Object.is
)

export const useKeyedStoreValue = <Key, T,>(
  store: KeyedReadStore<Key, T>,
  key: Key
): T => useExternalValue(
  listener => store.subscribe(key, listener),
  () => store.get(key),
  store.isEqual ?? Object.is
)

export const useOptionalKeyedStoreValue = <Key, T,>(
  store: KeyedReadStore<Key, T>,
  key: Key | undefined,
  emptyValue: T
): T => useExternalValue(
  listener => key === undefined
    ? () => {}
    : store.subscribe(key, listener),
  () => key === undefined
    ? emptyValue
    : store.get(key),
  store.isEqual ?? Object.is
)
