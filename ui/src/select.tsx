import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'ui-input flex h-8 w-full appearance-none rounded-md px-3 py-1.5 pr-8 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
