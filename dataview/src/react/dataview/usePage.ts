import {
  useRef
} from 'react'
import type {
  Equality
} from '@dataview/runtime/store'
import type {
  PageSessionApi,
  ResolvedPageState
} from '@dataview/react/page/session/types'
import {
  useExternalValue,
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'

export const usePage = (): ResolvedPageState => {
  const { page } = useDataView()
  const pageStore = page.store
  return useStoreValue(pageStore)
}

export const usePageValue = <TResult,>(
  selector: (state: ResolvedPageState) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const { page } = useDataView()
  const pageStore = page.store
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useExternalValue(
    pageStore.subscribe,
    () => selectorRef.current(pageStore.get()),
    isEqual ?? Object.is
  )
}
