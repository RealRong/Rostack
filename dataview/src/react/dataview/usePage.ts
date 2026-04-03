import type {
  Equality
} from '@dataview/runtime/store'
import type {
  ResolvedPageState
} from '@dataview/react/page/session/types'
import {
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'
import { useStoreSelector } from './storeSelector'

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
  return useStoreSelector(page.store, selector, isEqual)
}
