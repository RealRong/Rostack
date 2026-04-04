import { resolveOptionBadgeStyle } from '@ui/color'
import { cn } from '@ui/utils'

export interface PropertyOptionTagProps {
  label: string
  color?: string
  size?: 'sm' | 'md'
  interactive?: boolean
  className?: string
}

const sizeClassName: Record<NonNullable<PropertyOptionTagProps['size']>, string> = {
  sm: 'h-5 rounded-[4px] px-1.5 text-[12px] leading-5',
  md: 'h-6 rounded-[5px] px-2 text-[13px] leading-6'
}

export const PropertyOptionTag = (props: PropertyOptionTagProps) => {
  const size = props.size ?? 'sm'

  return (
    <span
      style={resolveOptionBadgeStyle(props.color)}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center whitespace-nowrap font-medium',
        sizeClassName[size],
        props.interactive && 'transition-colors',
        props.className
      )}
    >
      <span className="min-w-0 truncate">
        {props.label}
      </span>
    </span>
  )
}
