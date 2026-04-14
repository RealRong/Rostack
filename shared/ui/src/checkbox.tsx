import { Check, Minus } from 'lucide-react'
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { cn } from '@shared/ui/utils'

export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> {
  checked: boolean
  indeterminate?: boolean
  interactive?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const checkboxClassName = (input: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  interactive: boolean
  className?: string
}) => cn(
  'inline-flex size-[16px] shrink-0 items-center justify-center rounded border transition-colors',
  input.checked || input.indeterminate
    ? 'border-primary bg-accent text-white'
    : 'border-border bg-transparent text-transparent',
  input.interactive && !(input.checked || input.indeterminate) && 'hover:bg-hover',
  input.disabled && 'cursor-default border-border bg-muted text-transparent opacity-50 hover:bg-transparent',
  input.className
)

const CheckboxIndicator = (props: {
  checked: boolean
  indeterminate?: boolean
}) => {
  if (props.indeterminate) {
    return <Minus className="size-3" size={12} strokeWidth={2.4} />
  }

  if (props.checked) {
    return <Check className="size-3" size={12} strokeWidth={2.6} />
  }

  return null
}

export const Checkbox = (props: CheckboxProps) => {
  const {
    checked,
    indeterminate,
    interactive = true,
    onCheckedChange,
    className,
    disabled,
    type,
    ...domProps
  } = props

  if (!interactive) {
    const spanProps = domProps as HTMLAttributes<HTMLSpanElement>

    return (
      <span
        aria-hidden="true"
        className={checkboxClassName({
          checked,
          indeterminate,
          disabled,
          interactive,
          className
        })}
        {...spanProps}
      >
        <CheckboxIndicator
          checked={checked}
          indeterminate={indeterminate}
        />
      </span>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      onClick={() => {
        onCheckedChange?.(!checked)
      }}
      className={checkboxClassName({
        checked,
        indeterminate,
        disabled,
        interactive,
        className
      })}
      {...domProps}
    >
      <CheckboxIndicator
        checked={checked}
        indeterminate={indeterminate}
      />
    </button>
  )
}
