import type { KeyedReadStore, ReadStore } from '@shared/store'
import { useExternalValue } from './useExternalValue'

export const useStoreValue = <T,>(
  store: ReadStore<T>
): T => useExternalValue(
  store.subscribe,
  store.get,
  store.isEqual ?? Object.is
)

export const useKeyedStoreValue = <K, T>(
  store: KeyedReadStore<K, T>,
  key: K
): T => useExternalValue(
  listener => store.subscribe(key, listener),
  () => store.get(key),
  store.isEqual ?? Object.is
)
