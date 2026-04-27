import {
  LayoutGrid
} from 'lucide-react'
import { meta } from '@dataview/meta'
import {
  usePageModel
} from '@dataview/react/dataview'
import { useTranslation } from '@shared/i18n/react'
import {
  useStoreValue
} from '@shared/react'

export interface PageHeaderProps {
}

export const PageHeader = (_props: PageHeaderProps) => {
  const { t } = useTranslation()
  const pageModel = usePageModel()
  const header = useStoreValue(pageModel.header)
  const descriptor = meta.view.get(header.viewType)
  const CurrentIcon = header.viewType
    ? descriptor.Icon
    : LayoutGrid

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
                {t(descriptor.token)}
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
