import { cn } from '#shared-ui/utils'

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
    'relative inline-flex items-center p-[2px] h-[14px] w-[26px] shrink-0 rounded-full bg-surface-strong transition-colors',
    props.checked && 'bg-accent',
    props.disabled && 'cursor-not-allowed opacity-50',
    props.className
  )

  if (props.interactive === false) {
    return (
      <span
        aria-hidden="true"
        className={trackClassName}
        style={{ boxSizing: 'content-box' }}
      >
        <span
          className={cn(
            'h-4 w-4 rounded-full bg-white transition-transform',
            props.checked ? 'translate-x-[12px]' : 'translate-x-0'
          )}
        />
      </span>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      style={{ boxSizing: 'content-box' }}
      aria-checked={props.checked}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      disabled={props.disabled}
      onClick={() => props.onCheckedChange(!props.checked)}
      className={trackClassName}
    >
      <span
        className={cn(
          'h-4 w-4 rounded-full bg-white transition-transform',
          props.checked ? 'translate-x-[12px]' : 'translate-x-0'
        )}
      />
    </button>
  )
}
