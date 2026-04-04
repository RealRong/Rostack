import { renderMessage } from '@dataview/meta'
import { cn } from '@ui/utils'
import type { CreateViewItem } from './catalog'

export interface ViewTypeCardProps {
  item: CreateViewItem
  onSelect: (item: CreateViewItem) => void
}

export const ViewTypeCard = (props: ViewTypeCardProps) => {
  const { item } = props
  const label = renderMessage(item.label)
  const Icon = item.Icon

  return (
    <button
      type="button"
      disabled={!item.enabled}
      aria-label={label}
      onClick={() => props.onSelect(item)}
      className={cn(
        'group flex flex-col items-center justify-center gap-2 rounded-xl p-2 text-center transition-colors',
        item.enabled
          ? 'hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'cursor-not-allowed opacity-45'
      )}
    >
      <div className={cn(
        'flex size-8 items-center justify-center rounded-xl transition-colors',
        item.enabled
          ? 'text-foreground group-hover:border-border group-hover:bg-accent'
          : 'text-muted-foreground'
      )}>
        <Icon className="size-6" size={24} strokeWidth={1.8} />
      </div>
      <span className={cn(
        'text-sm font-medium',
        item.enabled ? 'text-foreground' : 'text-muted-foreground'
      )}>
        {label}
      </span>
    </button>
  )
}
