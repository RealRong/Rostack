import * as React from 'react'
import { cn } from '#shared-ui/utils'

const FLOATING_SURFACE_VARIANT_CLASS_NAMES = {
  compact: 'rounded-xl',
  panel: 'rounded-[14px]',
  bar: 'rounded-2xl'
} as const

export interface FloatingLayerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const FloatingLayer = React.forwardRef<HTMLDivElement, FloatingLayerProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('pointer-events-none absolute inset-0 overflow-visible', className)}
      {...props}
    />
  )
)

FloatingLayer.displayName = 'FloatingLayer'

export interface FloatingSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof FLOATING_SURFACE_VARIANT_CLASS_NAMES
}

export const FloatingSurface = React.forwardRef<HTMLDivElement, FloatingSurfaceProps>(
  ({ className, variant = 'compact', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'pointer-events-auto border border-default bg-floating shadow-popover',
        FLOATING_SURFACE_VARIANT_CLASS_NAMES[variant],
        className
      )}
      {...props}
    />
  )
)

FloatingSurface.displayName = 'FloatingSurface'
