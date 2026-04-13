import { Empty, KanbanCanvas } from './components'
import { KanbanProvider } from './context'
import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import {
  type ActiveKanbanViewState
} from './types'
import type { ViewState } from '@dataview/engine'

const DEFAULT_COLUMN_WIDTH = 320
const DEFAULT_COLUMN_MIN_HEIGHT = 260
const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

const readKanbanActiveState = (
  state: ViewState | undefined
): ActiveKanbanViewState | undefined => (
  state?.view.type === 'kanban'
    ? state as ActiveKanbanViewState
    : undefined
)

export interface KanbanViewProps {
  columnWidth?: number
  columnMinHeight?: number
}

export const KanbanView = (props: KanbanViewProps) => {
  const columnWidth = props.columnWidth ?? DEFAULT_COLUMN_WIDTH
  const columnMinHeight = props.columnMinHeight ?? DEFAULT_COLUMN_MIN_HEIGHT
  const active = useDataViewValue(
    dataView => dataView.engine.active.state,
    readKanbanActiveState
  )
  const extra = useDataViewValue(
    dataView => dataView.engine.active.kanban.state
  )
  if (!active || !extra) {
    throw new Error('Kanban view requires an active kanban state.')
  }

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
