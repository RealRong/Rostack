import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from 'react'
import type { KanbanController } from './useKanbanController'

export type Kanban = KanbanController

const KanbanContext = createContext<KanbanController | null>(null)

export const KanbanProvider = (props: {
  value: KanbanController
  children?: ReactNode
}) => createElement(KanbanContext.Provider, { value: props.value }, props.children)

export const useKanbanContext = () => {
  const value = useContext(KanbanContext)
  if (!value) {
    throw new Error('Missing KanbanProvider.')
  }

  return value
}
