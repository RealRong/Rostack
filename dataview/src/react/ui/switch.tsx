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
  if (props.interactive === false) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'ui-switch relative inline-flex h-5 w-11 shrink-0 rounded-full transition-colors',
          props.checked && 'ui-switch--checked',
          props.disabled && 'cursor-not-allowed opacity-50',
          props.className
        )}
      >
        <span
          className={cn(
            'ui-switch__thumb absolute top-0.5 h-4 w-4 rounded-full transition-transform',
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
      className={cn(
        'ui-switch relative inline-flex h-5 w-11 shrink-0 rounded-full transition-colors',
        props.checked && 'ui-switch--checked',
        props.disabled && 'cursor-not-allowed opacity-50',
        props.className
      )}
    >
      <span
        className={cn(
          'ui-switch__thumb absolute top-0.5 h-5 w-5 rounded-full transition-transform',
          props.checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
