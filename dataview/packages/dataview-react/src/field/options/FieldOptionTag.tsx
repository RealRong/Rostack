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
  appearance?: 'default' | 'card'
  onRemove?: () => void
  interactive?: boolean
  className?: string
}

export type FieldOptionTagAppearance = NonNullable<FieldOptionTagProps['appearance']>

const defaultTagClassName = 'h-[20px] rounded-[3px] px-1.5'
const defaultRemovableTagClassName = 'h-[20px] gap-1 rounded-[3px] pl-1.5 pr-1'
const statusTagClassName = 'h-[20px] gap-[5px] rounded-full pl-[7px] pr-[9px]'
const statusRemovableTagClassName = 'h-[20px] gap-[5px] rounded-full pl-[7px] pr-1'
const cardDefaultTagClassName = 'h-[18px] rounded-[3px] px-[6px]'
const cardDefaultRemovableTagClassName = 'h-[18px] gap-1 rounded-[3px] pl-[6px] pr-[4px]'
const cardStatusTagClassName = 'h-[18px] gap-[5px] rounded-[9px] pl-[7px] pr-[9px]'
const cardStatusRemovableTagClassName = 'h-[18px] gap-[5px] rounded-[9px] pl-[7px] pr-[4px]'
const defaultTextClassName = 'text-sm leading-5'
const cardTextClassName = 'text-[12px] leading-[18px]'
const defaultStatusDotClassName = 'size-2'
const cardStatusDotClassName = 'size-[8px]'

export const FieldOptionTag = (props: FieldOptionTagProps) => {
  const { t } = useTranslation()
  const variant = props.variant ?? 'default'
  const appearance = props.appearance ?? 'default'
  const removable = Boolean(props.onRemove)

  return (
    <span
      style={resolveOptionBadgeStyle(props.color)}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center whitespace-nowrap font-medium',
        appearance === 'card'
          ? variant === 'status'
            ? removable
              ? cardStatusRemovableTagClassName
              : cardStatusTagClassName
            : removable
              ? cardDefaultRemovableTagClassName
              : cardDefaultTagClassName
          : variant === 'status'
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
          className={cn(
            'shrink-0 rounded-full',
            appearance === 'card'
              ? cardStatusDotClassName
              : defaultStatusDotClassName
          )}
          style={resolveOptionStatusDotStyle(props.color)}
        />
      ) : null}
      <span className={cn(
        'min-w-0 truncate',
        appearance === 'card'
          ? cardTextClassName
          : defaultTextClassName
      )}>
        {props.label}
      </span>
      {props.onRemove ? (
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center text-current',
            appearance === 'card'
              ? 'size-[14px]'
              : 'size-4'
          )}
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
          <X
            className={cn(
              'opacity-70',
              appearance === 'card'
                ? 'size-[11px]'
                : 'size-3'
            )}
            size={appearance === 'card' ? 11 : 14}
            strokeWidth={1.8}
          />
        </button>
      ) : null}
    </span>
  )
}
