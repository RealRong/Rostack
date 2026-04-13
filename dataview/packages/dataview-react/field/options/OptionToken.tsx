import { X } from 'lucide-react'
import { Button } from '@shared/ui/button'
import {
  resolveOptionBadgeStyle,
  resolveOptionStatusDotStyle
} from '@shared/ui/color'
import { cn } from '@shared/ui/utils'
import { meta, renderMessage } from '@dataview/meta'

export interface OptionTokenProps {
  label: string
  color?: string
  variant?: 'default' | 'status'
  onRemove?: () => void
  className?: string
}

export const OptionToken = (props: OptionTokenProps) => (
  <span
    style={resolveOptionBadgeStyle(props.color)}
    className={cn(
      props.variant === 'status'
        ? 'inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-full pl-2 pr-1 font-medium text-[12px]'
        : 'inline-flex min-w-0 max-w-full items-center gap-1 rounded-[4px] pl-1.5 pr-1 text-[12px] font-medium leading-5',
      props.className
    )}
  >
    {props.variant === 'status' ? (
      <span
        className="size-2 shrink-0 rounded-full"
        style={resolveOptionStatusDotStyle(props.color)}
      />
    ) : null}
    <span className="min-w-0 truncate">
      {props.label}
    </span>
    {props.onRemove ? (
      <Button
        variant="plain"
        size="iconBare"
        className="text-current"
        aria-label={renderMessage(meta.ui.field.options.clear(props.label))}
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
        <X className="size-3 opacity-70" size={12} strokeWidth={1.8} />
      </Button>
    ) : null}
  </span>
)
