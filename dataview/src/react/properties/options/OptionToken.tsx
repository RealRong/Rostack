import { X } from 'lucide-react'
import { Button, cn, uiTone } from '@dataview/react/ui'
import { meta, renderMessage } from '@dataview/meta'

export interface OptionTokenProps {
  label: string
  color?: string
  onRemove?: () => void
  className?: string
}

export const OptionToken = (props: OptionTokenProps) => (
  <span
    className={cn(
      'inline-flex min-w-0 max-w-full items-center gap-1 rounded-[4px] pl-1.5 pr-1 text-[12px] font-medium leading-5',
      uiTone.tag(props.color),
      props.className
    )}
  >
    <span className="min-w-0 truncate">
      {props.label}
    </span>
    {props.onRemove ? (
      <Button
        variant="plain"
        size="iconBare"
        aria-label={renderMessage(meta.ui.property.options.clear(props.label))}
        onMouseDown={event => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          props.onRemove?.()
        }}
      >
        <X className="size-3 text-muted-foreground" size={12} strokeWidth={1.8} />
      </Button>
    ) : null}
  </span>
)
