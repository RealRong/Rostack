import { useCallback, useMemo, useRef, type RefObject } from 'react'
import type { SectionKey } from '@dataview/react/currentView'
import {
  readBoardLayout,
  type BoardLayout,
  type CardPosition
} from '../drag'

export interface LayoutRegistry {
  set: (key: SectionKey, layouts: readonly CardPosition[]) => void
  clear: (key: SectionKey) => void
  read: () => BoardLayout | null
}

export const useLayoutRegistry = (containerRef: RefObject<HTMLDivElement | null>): LayoutRegistry => {
  const columnLayoutsRef = useRef<Map<SectionKey, readonly CardPosition[]>>(new Map())

  const set = useCallback((key: SectionKey, layouts: readonly CardPosition[]) => {
    columnLayoutsRef.current.set(key, layouts)
  }, [])

  const clear = useCallback((key: SectionKey) => {
    columnLayoutsRef.current.delete(key)
  }, [])

  const read = useCallback(() => (
    readBoardLayout(containerRef.current, columnLayoutsRef.current)
  ), [containerRef])

  return useMemo(() => ({
    set,
    clear,
    read
  }), [clear, read, set])
}
