import { GalleryView } from '@dataview/react/views/gallery'
import type { ReactElement } from 'react'
import { viewTypeSpec } from '@dataview/core/view'
import {
  usePageModel
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

const viewBodySpec = {
  table: (props: PageBodyProps) => (
    <TableView
      rowHeight={props.table?.rowHeight}
    />
  ),
  kanban: (props: PageBodyProps) => (
    <KanbanView
      columnWidth={props.kanban?.columnWidth}
      columnMinHeight={props.kanban?.columnMinHeight}
    />
  ),
  gallery: (_props: PageBodyProps) => (
    <GalleryView />
  )
} as const satisfies Record<keyof typeof viewTypeSpec, (props: PageBodyProps) => ReactElement>

export const PageBody = (props: PageBodyProps) => {
  const pageModel = usePageModel()
  const body = useStoreValue(pageModel.body)
  const viewType = body.viewType

  if (!viewType) {
    return (
      <div className="rounded-xl border border-dashed bg-surface-muted/55 px-6 py-10 text-sm text-fg-muted">
        No view selected.
      </div>
    )
  }

  const render = viewBodySpec[viewType]
  if (!render) {
    return (
      <div className="rounded-xl border border-dashed bg-surface-muted/55 px-6 py-10 text-sm text-fg-muted">
        Unsupported view type: {viewType}
      </div>
    )
  }

  return render(props)
}
