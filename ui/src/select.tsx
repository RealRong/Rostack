import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'h-8 w-full appearance-none rounded-md border border-default bg-field px-3 py-1.5 pr-8 text-sm text-fg transition-[background-color,border-color,color,box-shadow] hover:border-strong focus-visible:outline-none focus-visible:[border-color:rgb(from_var(--ui-focus-ring)_r_g_b_/_0.45)] focus-visible:[box-shadow:0_0_0_3px_rgb(from_var(--ui-focus-ring)_r_g_b_/_0.14)] disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  </div>
))

Select.displayName = 'Select'
