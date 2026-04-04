import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@ui/utils'

export type QueryChipState =
  | 'idle'
  | 'active'
  | 'open'
  | 'add'

export interface QueryChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  state?: QueryChipState
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
}

export const QueryChip = forwardRef<HTMLButtonElement, QueryChipProps>(
  ({ state = 'idle', leading, trailing, children, className, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      data-state={state}
      className={cn(
        'inline-flex h-7 min-w-0 select-none items-center justify-center gap-1 whitespace-nowrap rounded-full border-0 bg-transparent px-2 text-sm font-semibold text-fg-muted transition-all duration-75 hover:bg-hover hover:text-fg focus-visible:outline-none disabled:cursor-default disabled:opacity-40',
        state === 'active' && 'bg-accent-tint text-accent hover:bg-accent-tint hover:text-accent',
        state === 'open' && 'bg-hover text-fg hover:bg-hover',
        className
      )}
      {...props}
    >
      {leading !== undefined && leading !== null ? (
        <span className="inline-flex shrink-0 items-center justify-center text-current">
          {leading}
        </span>
      ) : null}
      {children !== undefined && children !== null ? (
        <span className="min-w-0 overflow-hidden text-ellipsis">
          {children}
        </span>
      ) : null}
      {trailing !== undefined && trailing !== null ? (
        <span className="inline-flex shrink-0 items-center justify-center text-current">
          {trailing}
        </span>
      ) : null}
    </button>
  )
)

QueryChip.displayName = 'QueryChip'
