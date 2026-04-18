import { GalleryView } from '@dataview/react/views/gallery'
import {
  usePageRuntime
} from '@dataview/react/dataview'
import type { KanbanViewProps } from '@dataview/react/views/kanban'
import { KanbanView } from '@dataview/react/views/kanban'
import type { TableViewProps } from '@dataview/react/views/table'
import { TableView } from '@dataview/react/views/table'
import {
  useStoreValue
} from '@shared/react'

export interface PageBodyProps {
  table?: Pick<TableViewProps, 'rowHeight'>
  kanban?: Pick<KanbanViewProps, 'columnWidth' | 'columnMinHeight'>
}

export const PageBody = (props: PageBodyProps) => {
  const pageRuntime = usePageRuntime()
  const body = useStoreValue(pageRuntime.body)
  const viewType = body.viewType

  if (!viewType) {
    return (
      <div className="rounded-xl border border-dashed bg-surface-muted/55 px-6 py-10 text-sm text-fg-muted">
        No view selected.
      </div>
    )
  }

  switch (viewType) {
    case 'table':
      return (
        <TableView
          rowHeight={props.table?.rowHeight}
        />
      )
    case 'kanban':
      return (
        <KanbanView
          columnWidth={props.kanban?.columnWidth}
          columnMinHeight={props.kanban?.columnMinHeight}
        />
      )
    case 'gallery':
      return (
        <GalleryView />
      )
    default:
      return (
        <div className="rounded-xl border border-dashed bg-surface-muted/55 px-6 py-10 text-sm text-fg-muted">
          Unsupported view type: {viewType}
        </div>
      )
  }
}
