import {
  useRef
} from 'react'
import type {
  Equality,
  ReadStore
} from '@dataview/runtime/store'
import {
  useExternalValue
} from '@dataview/react/store'

export const useStoreSelector = <TState, TResult>(
  store: ReadStore<TState>,
  selector: (state: TState) => TResult,
  isEqual?: Equality<TResult>
): TResult => {
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useExternalValue(
    store.subscribe,
    () => selectorRef.current(store.get()),
    isEqual ?? Object.is
  )
}
