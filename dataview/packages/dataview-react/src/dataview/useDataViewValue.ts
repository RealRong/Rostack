import { equal, store } from '@shared/core'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import type { DataViewReactContextValue } from '@dataview/react/dataview/types'
import { useDataView } from '@dataview/react/dataview/provider'

export function useDataViewValue<TState>(
  resolveStore: (dataView: DataViewReactContextValue) => store.ReadStore<TState>
): TState
export function useDataViewValue<TState, TResult>(
  resolveStore: (dataView: DataViewReactContextValue) => store.ReadStore<TState>,
  selector: (state: TState) => TResult,
  isEqual?: equal.Equality<TResult>
): TResult
export function useDataViewValue<TState, TResult>(
  resolveStore: (dataView: DataViewReactContextValue) => store.ReadStore<TState>,
  selector?: (state: TState) => TResult,
  isEqual?: equal.Equality<TResult>
): TState | TResult {
  const dataView = useDataView()
  const store = resolveStore(dataView)

  if (!selector) {
    return useStoreValue(store)
  }

  return useStoreSelector(store, selector, isEqual)
}

export const useDataViewKeyedValue = <K, T>(
  resolveStore: (dataView: DataViewReactContextValue) => store.KeyedReadStore<K, T>,
  key: K
): T => {
  const dataView = useDataView()
  return useKeyedStoreValue(resolveStore(dataView), key)
}
