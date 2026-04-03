import {
  useRef
} from 'react'
import type {
  Equality
} from '@dataview/runtime/store'
import type {
  Selection
} from '@dataview/react/selection'
import {
  useExternalValue,
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'

export const useSelection = (): Selection => {
  const { selection } = useDataView()
  return useStoreValue(selection.store)
}

export const useSelectionValue = <TResult,>(
  selector: (state: Selection) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const { selection } = useDataView()
  const selectionStore = selection.store
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useExternalValue(
    selectionStore.subscribe,
    () => selectorRef.current(selectionStore.get()),
    isEqual ?? Object.is
  )
}
