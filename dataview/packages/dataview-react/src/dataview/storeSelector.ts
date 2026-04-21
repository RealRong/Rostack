import {
  useRef
} from 'react'
import { equal, store } from '@shared/core'
import {
  useExternalValue
} from '@shared/react'

export const useStoreSelector = <TState, TResult>(
  store: store.ReadStore<TState>,
  selector: (state: TState) => TResult,
  isEqual?: equal.Equality<TResult>
): TResult => {
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  return useExternalValue(
    store.subscribe,
    () => selectorRef.current(store.get()),
    isEqual ?? Object.is
  )
}
