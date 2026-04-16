import { X } from 'lucide-react'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import {
  resolveOptionBadgeStyle,
  resolveOptionStatusDotStyle
} from '@shared/ui/color'
import { cn } from '@shared/ui/utils'

export interface FieldOptionTagProps {
  label: string
  color?: string
  variant?: 'default' | 'status'
  onRemove?: () => void
  interactive?: boolean
  className?: string
}

const defaultTagClassName = 'h-[20px] rounded-[3px] px-1.5'
const defaultRemovableTagClassName = 'h-[20px] gap-1 rounded-[3px] pl-1.5 pr-1'
const statusTagClassName = 'h-[20px] gap-[5px] rounded-full pl-[7px] pr-[9px]'
const statusRemovableTagClassName = 'h-[20px] gap-[5px] rounded-full pl-[7px] pr-1'

export const FieldOptionTag = (props: FieldOptionTagProps) => {
  const { t } = useTranslation()
  const variant = props.variant ?? 'default'
  const removable = Boolean(props.onRemove)

  return (
    <span
      style={resolveOptionBadgeStyle(props.color)}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center whitespace-nowrap font-medium',
        variant === 'status'
          ? removable
            ? statusRemovableTagClassName
            : statusTagClassName
          : removable
            ? defaultRemovableTagClassName
            : defaultTagClassName,
        props.interactive && 'transition-colors',
        props.className
      )}
    >
      {variant === 'status' ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={resolveOptionStatusDotStyle(props.color)}
        />
      ) : null}
      <span className="min-w-0 truncate text-sm leading-5">
        {props.label}
      </span>
      {props.onRemove ? (
        <button
          type="button"
          className="inline-flex size-4 shrink-0 items-center justify-center text-current"
          aria-label={t(meta.ui.field.options.clear(props.label))}
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
          <X className="size-3 opacity-70" size={14} strokeWidth={1.8} />
        </button>
      ) : null}
    </span>
  )
}
