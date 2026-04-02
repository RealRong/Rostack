import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type QueryChipState =
  | 'idle'
  | 'active'
  | 'open'
  | 'add'

export interface QueryChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  state?: QueryChipState
  leading?: ReactNode
  trailing?: ReactNode
}

export const QueryChip = forwardRef<HTMLButtonElement, QueryChipProps>(
  ({ state = 'idle', leading, trailing, children, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      data-state={state}
      className="ui-query-chip"
      {...props}
    >
      {leading !== undefined && leading !== null ? (
        <span className="ui-query-chip__leading">
          {leading}
        </span>
      ) : null}
      {children !== undefined && children !== null ? (
        <span className="ui-query-chip__label">
          {children}
        </span>
      ) : null}
      {trailing !== undefined && trailing !== null ? (
        <span className="ui-query-chip__trailing">
          {trailing}
        </span>
      ) : null}
    </button>
  )
)

QueryChip.displayName = 'QueryChip'
