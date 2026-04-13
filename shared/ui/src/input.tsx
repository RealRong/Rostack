import * as React from 'react'
import { cn } from '#ui/utils.ts'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'h-9 w-full rounded-lg border bg-field-embedded px-3 py-1 text-sm font-semibold text-fg placeholder:text-fg-tertiary focus-visible:outline-none focus-visible:[box-shadow:0_0_0_3px_rgb(from_var(--ui-focus-ring)_r_g_b_/_0.14)] disabled:cursor-not-allowed disabled:opacity-40',
      className
    )}
    {...props}
  />
))

Input.displayName = 'Input'
