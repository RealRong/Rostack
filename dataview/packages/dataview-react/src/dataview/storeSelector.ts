import {
  useRef
} from 'react'
import type {
  Equality,
  ReadStore
} from '@shared/core'
import {
  useExternalValue
} from '@shared/react'

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
