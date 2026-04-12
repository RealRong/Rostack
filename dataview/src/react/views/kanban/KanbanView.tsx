import { Empty, KanbanCanvas } from './components'
import { KanbanProvider } from './context'
import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import {
  useKanbanController,
  type KanbanCurrentView
} from './useKanbanController'
import type { ActiveViewState } from '@dataview/engine'

const DEFAULT_COLUMN_WIDTH = 320
const DEFAULT_COLUMN_MIN_HEIGHT = 260
const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

const readKanbanCurrentView = (
  state: ActiveViewState | undefined
): KanbanCurrentView | undefined => (
  state?.view.type === 'kanban'
    ? state as KanbanCurrentView
    : undefined
)

export interface KanbanViewProps {
  columnWidth?: number
  columnMinHeight?: number
}

export const KanbanView = (props: KanbanViewProps) => {
  const columnWidth = props.columnWidth ?? DEFAULT_COLUMN_WIDTH
  const columnMinHeight = props.columnMinHeight ?? DEFAULT_COLUMN_MIN_HEIGHT
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.state,
    readKanbanCurrentView
  )
  const extra = useDataViewValue(
    dataView => dataView.engine.active.kanban.state
  )
  if (!currentView || !extra) {
    throw new Error('Kanban view requires an active kanban state.')
  }
  const controller = useKanbanController({
    currentView,
    extra,
    columnWidth,
    columnMinHeight
  })

  if (!controller.currentView.view.group) {
    return (
      <div style={contentInsetStyle}>
        <Empty />
      </div>
    )
  }

  return (
    <KanbanProvider value={controller}>
      <KanbanCanvas />
    </KanbanProvider>
  )
}
