import { Button, cn, type ButtonProps } from '@ui'
import { forwardRef, type ReactNode } from 'react'

export const TOOLBOX_LAYER_CLASSNAME = cn(
  'pointer-events-none absolute inset-0 z-[var(--wb-z-toolbar)] overflow-visible'
)

export const TOOLBOX_SURFACE_CLASSNAME = cn(
  'rounded-xl border border-[rgb(from_var(--ui-border-subtle)_r_g_b_/_0.4)] bg-floating shadow-popover'
)

export const TOOLBOX_PANEL_CLASSNAME = cn(
  'rounded-[14px] border border-[rgb(from_var(--ui-border-subtle)_r_g_b_/_0.45)] bg-floating shadow-popover'
)

export const TOOLBOX_ICON_BUTTON_CLASSNAME = cn(
  'relative h-10 w-10 overflow-hidden rounded-[10px] text-fg-muted hover:text-fg'
)

export const TOOLBOX_OPTION_BUTTON_CLASSNAME = cn(
  'h-auto w-full justify-start rounded-lg px-2 py-1.5 text-left text-fg hover:text-fg'
)

export const TOOLBOX_GRID_BUTTON_CLASSNAME = cn(
  'h-auto w-full rounded-lg p-1.5 text-fg-muted hover:text-fg'
)

export const TOOLBOX_BUTTON_TINT_CLASSNAME = cn(
  'pointer-events-none absolute inset-x-[7px] bottom-[7px] h-1 rounded-full bg-surface-strong opacity-90'
)

export const ToolboxButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function ToolboxButton(
    {
      variant = 'ghost',
      ...props
    },
    ref
  ) {
    return (
      <Button
        ref={ref}
        variant={variant}
        {...props}
      />
    )
  }
)

export const ToolboxMenuSection = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}) => (
  <div className="min-w-0">
    <div className="mb-2.5 px-1 text-sm font-semibold text-fg-muted">
      {title}
    </div>
    {children}
  </div>
)

export const ToolboxColorSwatch = ({
  color,
  active = false,
  onClick
}: {
  color: string
  active?: boolean
  onClick: () => void
}) => (
  <ToolboxButton
    type="button"
    aria-label={color}
    title={color}
    className={cn(
      'h-10 w-10 rounded-xl border border-default p-0 hover:border-strong',
      active && 'outline outline-2 outline-offset-2 outline-[var(--ui-accent)] hover:border-default'
    )}
    style={{
      backgroundColor: color
    }}
    onClick={onClick}
  />
)
