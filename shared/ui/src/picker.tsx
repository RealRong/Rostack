import * as React from 'react'
import { Button, type ButtonProps } from '@shared/ui/button'
import { FloatingSurface, type FloatingSurfaceProps } from '@shared/ui/floating'
import { cn } from '@shared/ui/utils'

export const PickerSurface = React.forwardRef<HTMLDivElement, FloatingSurfaceProps>(
  ({ className, ...props }, ref) => (
    <FloatingSurface
      ref={ref}
      className={cn('flex flex-col gap-1 p-1.5', className)}
      {...props}
    />
  )
)

PickerSurface.displayName = 'PickerSurface'

export const PickerPanelSurface = React.forwardRef<HTMLDivElement, FloatingSurfaceProps>(
  ({ className, ...props }, ref) => (
    <FloatingSurface
      ref={ref}
      className={cn('p-2 text-sm', className)}
      {...props}
    />
  )
)

PickerPanelSurface.displayName = 'PickerPanelSurface'

export const PickerButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'ghost', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      className={cn('text-fg', className)}
      {...props}
    />
  )
)

PickerButton.displayName = 'PickerButton'

export const PickerIconButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <PickerButton
      ref={ref}
      className={cn(
        'relative h-10 w-10 overflow-hidden rounded-[10px] p-0 text-fg-muted hover:text-fg',
        className
      )}
      {...props}
    />
  )
)

PickerIconButton.displayName = 'PickerIconButton'

export const PickerOptionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <PickerButton
      ref={ref}
      className={cn('h-auto w-full justify-start rounded-lg px-2 py-1.5 text-left text-fg hover:text-fg', className)}
      {...props}
    />
  )
)

PickerOptionButton.displayName = 'PickerOptionButton'

export const PickerGridButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <PickerButton
      ref={ref}
      className={cn('h-auto w-full rounded-lg p-1.5 text-fg-muted hover:text-fg', className)}
      {...props}
    />
  )
)

PickerGridButton.displayName = 'PickerGridButton'

export const PickerSection = ({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) => (
  <div className="min-w-0">
    <div className="mb-2.5 px-1 text-sm font-semibold text-fg-muted">
      {title}
    </div>
    {children}
  </div>
)

export const PickerDivider = () => (
  <div className="mx-0 my-0.5 h-px w-full bg-overlay-strong" />
)
