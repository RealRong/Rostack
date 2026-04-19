import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from 'react'
import { Empty, KanbanCanvas } from '@dataview/react/views/kanban/components'
import type { CardSize } from '@dataview/core/contracts'
import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import {
  useKanbanRuntime
} from '@dataview/react/views/kanban/runtime'
import type {
  KanbanViewRuntime
} from '@dataview/react/views/kanban/types'

const DEFAULT_COLUMN_WIDTH = 320
const DEFAULT_COLUMN_MIN_HEIGHT = 260
const KANBAN_COLUMN_WIDTH_DELTA: Record<CardSize, number> = {
  sm: -40,
  md: 0,
  lg: 40
}
const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const
const KanbanContext = createContext<KanbanViewRuntime | null>(null)

const resolveColumnWidth = (
  baseWidth: number,
  size: CardSize
) => Math.max(240, baseWidth + KANBAN_COLUMN_WIDTH_DELTA[size])

export interface KanbanViewProps {
  columnWidth?: number
  columnMinHeight?: number
}

export const KanbanProvider = (props: {
  columnWidth: number
  columnMinHeight: number
  children?: ReactNode
}) => {
  const runtime = useKanbanRuntime({
    columnWidth: props.columnWidth,
    columnMinHeight: props.columnMinHeight
  })

  return createElement(KanbanContext.Provider, { value: runtime }, props.children)
}

export const KanbanView = (props: KanbanViewProps) => {
  const viewType = useDataViewValue(
    dataView => dataView.source.active.view.type
  )
  const grouped = useDataViewValue(
    dataView => dataView.source.active.query.grouped
  )
  const size = useDataViewValue(
    dataView => dataView.source.active.kanban.size
  )
  if (viewType !== 'kanban') {
    return null
  }

  const baseColumnWidth = props.columnWidth ?? DEFAULT_COLUMN_WIDTH
  const columnWidth = resolveColumnWidth(baseColumnWidth, size)
  const columnMinHeight = props.columnMinHeight ?? DEFAULT_COLUMN_MIN_HEIGHT

  if (!grouped) {
    return (
      <div style={contentInsetStyle}>
        <Empty />
      </div>
    )
  }

  return (
    <KanbanProvider
      columnWidth={columnWidth}
      columnMinHeight={columnMinHeight}
    >
      <KanbanCanvas />
    </KanbanProvider>
  )
}

export const useKanbanRuntimeContext = (): KanbanViewRuntime => {
  const value = useContext(KanbanContext)
  if (!value) {
    throw new Error('Missing KanbanView.')
  }

  return value
}
