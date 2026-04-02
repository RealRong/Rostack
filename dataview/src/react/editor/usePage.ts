import {
  useRef
} from 'react'
import type {
  Equality
} from '@/runtime/store'
import type {
  PageSessionApi,
  ResolvedPageState
} from '@/react/page/session/types'
import {
  useExternalValue,
  useStoreValue
} from '@/react/runtime/store'
import { useEditorContext } from './provider'

export const usePage = (): ResolvedPageState => {
  const { pageStore } = useEditorContext()
  return useStoreValue(pageStore)
}

export const usePageValue = <TResult,>(
  selector: (state: ResolvedPageState) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const { pageStore } = useEditorContext()
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useExternalValue(
    pageStore.subscribe,
    () => selectorRef.current(pageStore.get()),
    isEqual ?? Object.is
  )
}

export const usePageActions = (): PageSessionApi => (
  useEditorContext().page
)
