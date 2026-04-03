import { type Equality } from '@dataview/runtime/store'
import type {
  CurrentView
} from '@dataview/react/runtime/currentView'
import {
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'
import { useStoreSelector } from './storeSelector'

export function useCurrentView(): CurrentView | undefined
export function useCurrentView<TResult>(
  selector: (currentView: CurrentView | undefined) => TResult,
  isEqual?: Equality<TResult>
): TResult
export function useCurrentView<TResult>(
  selector?: (currentView: CurrentView | undefined) => TResult,
  isEqual?: Equality<TResult>
): CurrentView | TResult | undefined {
  const dataView = useDataView()
  const currentViewStore = dataView.currentView

  if (!selector) {
    return useStoreValue(currentViewStore)
  }

  return useStoreSelector(currentViewStore, selector, isEqual)
}
