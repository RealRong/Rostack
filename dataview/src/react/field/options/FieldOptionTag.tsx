import {
  resolveOptionBadgeStyle,
  resolveOptionStatusDotStyle
} from '@ui/color'
import { cn } from '@ui/utils'

export interface FieldOptionTagProps {
  label: string
  color?: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'status'
  interactive?: boolean
  className?: string
}

const defaultSizeClassName: Record<NonNullable<FieldOptionTagProps['size']>, string> = {
  sm: 'h-5 rounded-[4px] px-1.5 text-[12px] leading-5',
  md: 'h-6 rounded-[5px] px-2 text-[13px] leading-6'
}

const statusSizeClassName: Record<NonNullable<FieldOptionTagProps['size']>, string> = {
  sm: 'h-6 rounded-full px-2 text-[12px]',
  md: 'h-6 rounded-full px-2 text-[12px]'
}

export const FieldOptionTag = (props: FieldOptionTagProps) => {
  const size = props.size ?? 'sm'
  const variant = props.variant ?? 'default'

  return (
    <span
      style={resolveOptionBadgeStyle(props.color)}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center whitespace-nowrap font-medium',
        variant === 'status'
          ? cn('gap-1.5', statusSizeClassName[size])
          : defaultSizeClassName[size],
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
      <span className="min-w-0 truncate">
        {props.label}
      </span>
    </span>
  )
}
