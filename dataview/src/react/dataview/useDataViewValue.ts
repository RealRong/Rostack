import type {
  Equality,
  KeyedReadStore,
  ReadStore
} from '@shared/core'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'
import { useStoreSelector } from './storeSelector'
import type { DataViewContextValue } from './types'
import { useDataView } from './provider'

export function useDataViewValue<TState>(
  resolveStore: (dataView: DataViewContextValue) => ReadStore<TState>
): TState
export function useDataViewValue<TState, TResult>(
  resolveStore: (dataView: DataViewContextValue) => ReadStore<TState>,
  selector: (state: TState) => TResult,
  isEqual?: Equality<TResult>
): TResult
export function useDataViewValue<TState, TResult>(
  resolveStore: (dataView: DataViewContextValue) => ReadStore<TState>,
  selector?: (state: TState) => TResult,
  isEqual?: Equality<TResult>
): TState | TResult {
  const dataView = useDataView()
  const store = resolveStore(dataView)

  if (!selector) {
    return useStoreValue(store)
  }

  return useStoreSelector(store, selector, isEqual)
}

export const useDataViewKeyedValue = <K, T>(
  resolveStore: (dataView: DataViewContextValue) => KeyedReadStore<K, T>,
  key: K
): T => {
  const dataView = useDataView()
  return useKeyedStoreValue(resolveStore(dataView), key)
}
