import * as React from 'react'
import { cn } from '@shared/ui/utils'

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

export interface FloatingSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {}

export const FloatingSurface = React.forwardRef<HTMLDivElement, FloatingSurfaceProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'pointer-events-auto rounded-lg bg-floating shadow-popover',
        className
      )}
      {...props}
    />
  )
)

FloatingSurface.displayName = 'FloatingSurface'
