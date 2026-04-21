import { equal, store } from '@shared/core'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import type { DataViewReactContextValue } from '@dataview/react/dataview/types'
import { useDataView } from '@dataview/react/dataview/provider'
import type { DataViewSessionState } from '@dataview/runtime/dataview/types'

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

export const useDataViewSessionSelector = <TResult>(
  selector: (state: DataViewSessionState) => TResult,
  isEqual?: equal.Equality<TResult>
): TResult => {
  const dataView = useDataView()
  return useStoreSelector(dataView.session.store, selector, isEqual)
}
