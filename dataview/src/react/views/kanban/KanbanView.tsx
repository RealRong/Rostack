import type { ViewId } from '@/core/contracts'
import { Board } from './components'
import { KanbanProvider } from './context'

const DEFAULT_COLUMN_WIDTH = 320
const DEFAULT_COLUMN_MIN_HEIGHT = 260

export interface KanbanViewProps {
  viewId: ViewId
  columnWidth?: number
  columnMinHeight?: number
}

export const KanbanView = (props: KanbanViewProps) => {
  const columnWidth = props.columnWidth ?? DEFAULT_COLUMN_WIDTH
  const columnMinHeight = props.columnMinHeight ?? DEFAULT_COLUMN_MIN_HEIGHT

  return (
    <KanbanProvider
      viewId={props.viewId}
      columnWidth={columnWidth}
      columnMinHeight={columnMinHeight}
    >
      <Board />
    </KanbanProvider>
  )
}
