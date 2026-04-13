import * as React from 'react'
import { Button, type ButtonProps } from '#shared-ui/button'
import { FloatingSurface, type FloatingSurfaceProps } from '#shared-ui/floating'
import { cn } from '#shared-ui/utils'

export interface ToolbarButtonProps extends ButtonProps {
  active?: boolean
}

export const ToolbarBar = React.forwardRef<HTMLDivElement, FloatingSurfaceProps>(
  ({ className, variant = 'bar', ...props }, ref) => (
    <FloatingSurface
      ref={ref}
      variant={variant}
      className={cn('inline-flex items-center gap-1 px-2 py-1.5', className)}
      {...props}
    />
  )
)

ToolbarBar.displayName = 'ToolbarBar'

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ active, className, pressed, variant = 'ghost', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      pressed={pressed ?? active}
      className={cn('h-9 min-w-0 rounded-xl px-3 text-sm font-medium text-fg', className)}
      {...props}
    />
  )
)

ToolbarButton.displayName = 'ToolbarButton'

export const ToolbarIconButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ className, ...props }, ref) => (
    <ToolbarButton
      ref={ref}
      className={cn('w-9 p-0', className)}
      {...props}
    />
  )
)

ToolbarIconButton.displayName = 'ToolbarIconButton'

export const ToolbarDivider = () => (
  <div className="mx-1 h-6 w-0 shrink-0 border-r border-divider" />
)

export const ToolbarTextColorIcon = ({
  color
}: {
  color?: string
}) => (
  <span className="relative inline-flex h-5 w-5 items-center justify-center">
    <span className="text-base font-semibold leading-none">A</span>
    <span
      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
      style={{
        background: color ?? 'var(--ui-text-primary)'
      }}
    />
  </span>
)

export const ToolbarStrokeIcon = ({
  stroke,
  strokeWidth,
  strokeDash,
  opacity
}: {
  stroke?: string
  strokeWidth?: number
  strokeDash?: readonly number[]
  opacity?: number
}) => (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="none"
  >
    <rect
      x="4.5"
      y="5"
      width="15"
      height="14"
      rx="3"
      stroke={stroke ?? 'currentColor'}
      strokeWidth={Math.min(2.2, Math.max(1.2, strokeWidth ?? 1.5))}
      strokeDasharray={strokeDash?.join(' ')}
      strokeOpacity={opacity ?? 1}
    />
  </svg>
)

export const ToolbarFillIcon = ({
  fill,
  opacity
}: {
  fill?: string
  opacity?: number
}) => (
  <div
    className="size-5 rounded-md border border-default"
    style={{
      background: fill ?? 'var(--ui-gray-bg-soft)',
      opacity: opacity ?? 1
    }}
  />
)
