import { Plus } from 'lucide-react'
import { useState } from 'react'
import { meta } from '@dataview/meta'
import { useDataView } from '@dataview/react/dataview'
import { Button } from '@shared/ui/button'
import { Popover } from '@shared/ui/popover'
import { useTranslation } from '@shared/i18n/react'
import { CREATE_VIEW_ITEMS, type CreateViewItem } from '@dataview/react/page/features/createView/catalog'
import { ViewTypeCard } from '@dataview/react/page/features/createView/ViewTypeCard'

export const CreateViewPopover = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const [open, setOpen] = useState(false)

  const handleSelect = (item: CreateViewItem) => {
    if (!item.enabled) {
      return
    }

    const viewId = dataView.engine.views.create({
      name: t(item.label),
      type: item.type as 'table' | 'gallery' | 'kanban'
    })
    if (!viewId) {
      return
    }

    dataView.engine.views.open(viewId)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      mode="blocking"
      backdrop="transparent"
    >
      <Popover.Trigger>
        <Button
          size="icon"
          pressed={open}
          aria-label={t(meta.ui.toolbar.newView)}
        >
          <Plus className="size-4" size={15} strokeWidth={1} />
        </Button>
      </Popover.Trigger>
      <Popover.Content
        initialFocus={-1}
        padding="none"
        contentClassName="w-[360px]"
      >
        <div className="flex flex-col gap-5 p-4">
          <div className="space-y-1">
            <h3 className="text-sm text-muted-foreground">
              {t(meta.ui.toolbar.createView.title)}
            </h3>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {CREATE_VIEW_ITEMS.map(item => (
              <ViewTypeCard
                key={item.id}
                item={item}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>
      </Popover.Content>
    </Popover>
  )
}
