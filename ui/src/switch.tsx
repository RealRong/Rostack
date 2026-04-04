import { cn } from './utils'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  interactive?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

export const Switch = (props: SwitchProps) => {
  const trackClassName = cn(
    'relative inline-flex h-5 w-11 shrink-0 rounded-full bg-surface-strong transition-colors',
    props.checked && 'bg-primary',
    props.disabled && 'cursor-not-allowed opacity-50',
    props.className
  )

  if (props.interactive === false) {
    return (
      <span
        aria-hidden="true"
        className={trackClassName}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-[0_0_0_1px_rgb(from_var(--ui-border-default)_r_g_b_/_0.4)] transition-transform',
            props.checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </span>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      disabled={props.disabled}
      onClick={() => props.onCheckedChange(!props.checked)}
      className={trackClassName}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-[0_0_0_1px_rgb(from_var(--ui-border-default)_r_g_b_/_0.4)] transition-transform',
          props.checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
