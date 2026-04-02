import {
  useRef
} from 'react'
import { type Equality } from '@/runtime/store'
import type {
  CurrentView
} from '@/react/view'
import {
  useExternalValue,
  useStoreValue
} from '@/react/runtime/store'
import { useEditorContext } from './provider'

export function useCurrentView(): CurrentView | undefined
export function useCurrentView<TResult>(
  selector: (currentView: CurrentView | undefined) => TResult,
  isEqual?: Equality<TResult>
): TResult
export function useCurrentView<TResult>(
  selector?: (currentView: CurrentView | undefined) => TResult,
  isEqual?: Equality<TResult>
): CurrentView | TResult | undefined {
  const { currentViewStore } = useEditorContext()

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
