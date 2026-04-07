import { Plus } from 'lucide-react'
import { useState } from 'react'
import { meta, renderMessage } from '@dataview/meta'
import { Button } from '@ui/button'
import { Popover } from '@ui/popover'
import { CREATE_VIEW_ITEMS, type CreateViewItem } from './catalog'
import { useCreateView } from './useCreateView'
import { ViewTypeCard } from './ViewTypeCard'

export const CreateViewPopover = () => {
  const [open, setOpen] = useState(false)
  const createView = useCreateView()

  const handleSelect = (item: CreateViewItem) => {
    const viewId = createView(item)
    if (!viewId) {
      return
    }

    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      initialFocus={-1}
      mode="blocking"
      backdrop="transparent"
      padding="none"
      trigger={(
        <Button
          size="icon"
          pressed={open}
          aria-label={renderMessage(meta.ui.toolbar.newView)}
        >
          <Plus className="size-4" size={15} strokeWidth={1} />
        </Button>
      )}
      contentClassName="w-[360px]"
    >
      <div className="flex flex-col gap-5 p-4">
        <div className="space-y-1">
          <h3 className="text-sm text-muted-foreground">
            {renderMessage(meta.ui.toolbar.createView.title)}
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
    </Popover>
  )
}
