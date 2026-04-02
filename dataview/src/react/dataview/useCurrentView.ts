import {
  useRef
} from 'react'
import { type Equality } from '@dataview/runtime/store'
import type {
  CurrentView
} from '@dataview/react/currentView'
import {
  useExternalValue,
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'

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
  const currentViewStore = dataView.currentView.store

  if (!selector) {
    return useStoreValue(currentViewStore)
  }

  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const equal = isEqual ?? Object.is

  return useExternalValue(
    currentViewStore.subscribe,
    () => selectorRef.current(currentViewStore.get()),
    equal
  )
}
