import {
  useRef
} from 'react'
import type {
  Equality
} from '@dataview/runtime/store'
import type {
  InlineSessionTarget
} from '@dataview/react/inlineSession'
import {
  useExternalValue,
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'

export const useInlineSession = (): InlineSessionTarget | null => {
  const { inlineSession } = useDataView()
  return useStoreValue(inlineSession.store)
}

export const useInlineSessionValue = <TResult,>(
  selector: (state: InlineSessionTarget | null) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const { inlineSession } = useDataView()
  const inlineSessionStore = inlineSession.store
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useExternalValue(
    inlineSessionStore.subscribe,
    () => selectorRef.current(inlineSessionStore.get()),
    isEqual ?? Object.is
  )
}
