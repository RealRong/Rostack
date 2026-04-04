import type { ViewId } from '@dataview/core/contracts'
import { Empty, KanbanCanvas } from './components'
import { KanbanProvider } from './context'
import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useKanbanController } from './useKanbanController'

const DEFAULT_COLUMN_WIDTH = 320
const DEFAULT_COLUMN_MIN_HEIGHT = 260
const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

export interface KanbanViewProps {
  viewId: ViewId
  columnWidth?: number
  columnMinHeight?: number
}

export const KanbanView = (props: KanbanViewProps) => {
  const columnWidth = props.columnWidth ?? DEFAULT_COLUMN_WIDTH
  const columnMinHeight = props.columnMinHeight ?? DEFAULT_COLUMN_MIN_HEIGHT
  const controller = useKanbanController({
    viewId: props.viewId,
    columnWidth,
    columnMinHeight
  })

  if (!controller.currentView.view.query.group) {
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
