import { Empty, KanbanCanvas } from '@dataview/react/views/kanban/components'
import { KanbanProvider } from '@dataview/react/views/kanban/context'
import type { CardSize } from '@dataview/core/contracts'
import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import {
  type ActiveKanbanViewState
} from '@dataview/react/views/kanban/types'
import type { ViewState } from '@dataview/engine'
import {
  readActiveTypedViewState
} from '@dataview/react/views/shared/types'

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

const readKanbanActiveState = readActiveTypedViewState('kanban')

const resolveColumnWidth = (
  baseWidth: number,
  size: CardSize
) => Math.max(240, baseWidth + KANBAN_COLUMN_WIDTH_DELTA[size])

export interface KanbanViewProps {
  columnWidth?: number
  columnMinHeight?: number
}

export const KanbanView = (props: KanbanViewProps) => {
  const active = useDataViewValue(
    dataView => dataView.engine.active.state,
    readKanbanActiveState
  )
  const extra = useDataViewValue(
    dataView => dataView.engine.active.kanban.state
  )
  if (!active || !extra) {
    return null
  }

  const baseColumnWidth = props.columnWidth ?? DEFAULT_COLUMN_WIDTH
  const columnWidth = resolveColumnWidth(baseColumnWidth, extra.card.size)
  const columnMinHeight = props.columnMinHeight ?? DEFAULT_COLUMN_MIN_HEIGHT

  if (!active.query.group.active) {
    return (
      <div style={contentInsetStyle}>
        <Empty />
      </div>
    )
  }

  return (
    <KanbanProvider
      active={active}
      extra={extra}
      columnWidth={columnWidth}
      columnMinHeight={columnMinHeight}
    >
      <KanbanCanvas />
    </KanbanProvider>
  )
}
