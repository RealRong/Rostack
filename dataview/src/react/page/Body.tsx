import { GalleryView } from '@/react/views/gallery'
import { useCurrentView } from '@/react/editor'
import type { KanbanViewProps } from '@/react/views/kanban'
import { KanbanView } from '@/react/views/kanban'
import type { TableViewProps } from '@/react/views/table'
import { TableView } from '@/react/views/table'

export interface PageBodyProps {
  table?: Pick<TableViewProps, 'rowHeight'>
  kanban?: Pick<KanbanViewProps, 'columnWidth' | 'columnMinHeight'>
}

export const PageBody = (props: PageBodyProps) => {
  const currentView = useCurrentView()
  const view = currentView?.view

  if (!view) {
    return (
      <div className="ui-surface-empty rounded-xl px-6 py-10 text-sm">
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
          viewId={view.id}
          columnWidth={props.kanban?.columnWidth}
          columnMinHeight={props.kanban?.columnMinHeight}
        />
      )
    case 'gallery':
      return (
        <GalleryView
          viewId={view.id}
        />
      )
    default:
      return (
        <div className="ui-surface-empty rounded-xl px-6 py-10 text-sm">
          Unsupported view type: {view.type}
        </div>
      )
  }
}
