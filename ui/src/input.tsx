import * as React from 'react'
import { cn } from './utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'ui-text-input flex h-9 w-full rounded-lg px-3 py-1 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      className
    )}
    {...props}
  />
))

Input.displayName = 'Input'
