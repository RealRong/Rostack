import type {
  Equality
} from '@dataview/runtime/store'
import type {
  Selection
} from '@dataview/react/runtime/selection'
import {
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'
import { useStoreSelector } from './storeSelector'

export const useSelection = (): Selection => {
  const { selection } = useDataView()
  return useStoreValue(selection.store)
}

export const useSelectionValue = <TResult,>(
  selector: (state: Selection) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const { selection } = useDataView()
  return useStoreSelector(selection.store, selector, isEqual)
}
