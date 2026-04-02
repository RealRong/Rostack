import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from 'react'
import type { ViewId } from '@dataview/core/contracts'
import type {
  GroupKanbanCreateCardInput,
  GroupKanbanMoveCardsInput
} from '@dataview/engine'

export interface KanbanProviderProps {
  viewId: ViewId
  columnWidth: number
  columnMinHeight: number
  children?: ReactNode
}

export interface Kanban {
  viewId: ViewId
  layout: {
    columnWidth: number
    columnMinHeight: number
  }
}

export type {
  GroupKanbanCreateCardInput as KanbanCreateCardInput,
  GroupKanbanMoveCardsInput as KanbanMoveCardsInput
}

const KanbanContext = createContext<Kanban | null>(null)

export const KanbanProvider = (props: KanbanProviderProps) => {
  const value: Kanban = {
    viewId: props.viewId,
    layout: {
      columnWidth: props.columnWidth,
      columnMinHeight: props.columnMinHeight
    }
  }

  return createElement(KanbanContext.Provider, { value }, props.children)
}

export const useKanbanContext = () => {
  const value = useContext(KanbanContext)
  if (!value) {
    throw new Error('Missing KanbanProvider.')
  }
  return value
}
