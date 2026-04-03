import type {
  Equality
} from '@dataview/runtime/store'
import type {
  InlineSessionTarget
} from '@dataview/react/runtime/inlineSession'
import {
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'
import { useStoreSelector } from './storeSelector'

export const useInlineSession = (): InlineSessionTarget | null => {
  const { inlineSession } = useDataView()
  return useStoreValue(inlineSession.store)
}

export const useInlineSessionValue = <TResult,>(
  selector: (state: InlineSessionTarget | null) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const { inlineSession } = useDataView()
  return useStoreSelector(inlineSession.store, selector, isEqual)
}
