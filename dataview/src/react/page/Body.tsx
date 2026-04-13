import { GalleryView } from '@dataview/react/views/gallery'
import { useDataViewValue } from '@dataview/react/dataview'
import type { KanbanViewProps } from '@dataview/react/views/kanban'
import { KanbanView } from '@dataview/react/views/kanban'
import type { TableViewProps } from '@dataview/react/views/table'
import { TableView } from '@dataview/react/views/table'

export interface PageBodyProps {
  table?: Pick<TableViewProps, 'rowHeight'>
  kanban?: Pick<KanbanViewProps, 'columnWidth' | 'columnMinHeight'>
}

export const PageBody = (props: PageBodyProps) => {
  const view = useDataViewValue(dataView => dataView.engine.view.config)

  if (!view) {
    return (
      <div className="rounded-xl border border-dashed bg-surface-muted/55 px-6 py-10 text-sm text-fg-muted">
        No view selected.
      </div>
    )
  }

  switch (view.type) {
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
          Unsupported view type: {view.type}
        </div>
      )
  }
}
