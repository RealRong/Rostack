import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode
} from 'react'
import type { KanbanState } from '@dataview/engine'
import {
  useKanbanRuntime
} from '#react/views/kanban/runtime.ts'
import type {
  ActiveKanbanViewState,
  KanbanViewRuntime
} from '#react/views/kanban/types.ts'

export interface KanbanContextValue {
  active: ActiveKanbanViewState
  extra: KanbanState
  runtime: KanbanViewRuntime
}

export type Kanban = KanbanContextValue

const KanbanContext = createContext<KanbanContextValue | null>(null)

export const KanbanProvider = (props: {
  active: ActiveKanbanViewState
  extra: KanbanState
  columnWidth: number
  columnMinHeight: number
  children?: ReactNode
}) => {
  const runtime = useKanbanRuntime({
    active: props.active,
    extra: props.extra,
    columnWidth: props.columnWidth,
    columnMinHeight: props.columnMinHeight
  })
  const value = useMemo<KanbanContextValue>(() => ({
    active: props.active,
    extra: props.extra,
    runtime
  }), [
    props.active,
    props.extra,
    runtime
  ])

  return createElement(KanbanContext.Provider, { value }, props.children)
}

export const useKanbanContext = () => {
  const value = useContext(KanbanContext)
  if (!value) {
    throw new Error('Missing KanbanProvider.')
  }

  return value
}
