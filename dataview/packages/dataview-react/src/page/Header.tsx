import {
  KanbanSquare,
  LayoutGrid,
  Table2
} from 'lucide-react'
import { type ComponentType } from 'react'
import type { ViewType } from '@dataview/core/types'
import {
  usePageModel
} from '@dataview/react/dataview'
import {
  useStoreValue
} from '@shared/react'

interface IconProps {
  className?: string
  size?: number
  strokeWidth?: number
}

const viewIcon = (type?: ViewType): ComponentType<IconProps> => {
  switch (type) {
    case 'table':
      return Table2
    case 'gallery':
      return LayoutGrid
    case 'kanban':
      return KanbanSquare
    default:
      return LayoutGrid
  }
}

const viewTypeLabel = (type?: ViewType) => type ?? 'unknown'

export interface PageHeaderProps {
}

export const PageHeader = (_props: PageHeaderProps) => {
  const pageModel = usePageModel()
  const header = useStoreValue(pageModel.header)
  const CurrentIcon = viewIcon(header.viewType)

  return (
    <section className="text-card-foreground">
      <div className="min-w-0">
        <div className="text-sm font-medium text-muted-foreground">
          Current View
        </div>
        {header.viewId ? (
          <div className="mt-2 flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-surface-muted">
              <CurrentIcon className="size-5" size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{header.viewName}</div>
              <div className="text-sm text-muted-foreground">
                {viewTypeLabel(header.viewType)}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">
            No view selected.
          </div>
        )}
      </div>
    </section>
  )
}
