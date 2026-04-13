import type {
  InputHTMLAttributes,
  ReactNode
} from 'react'
import { focusInputWithoutScroll } from '@shared/dom'
import { cn } from '@shared/ui/utils'

export interface PickerInputBarProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> {
  inputRef: {
    current: HTMLInputElement | null
  }
  value: string
  onValueChange: (value: string) => void
  children?: ReactNode
  className?: string
  inputClassName?: string
}

export const PickerInputBar = ({
  inputRef,
  value,
  onValueChange,
  children,
  className,
  inputClassName,
  ...inputProps
}: PickerInputBarProps) => (
  <div
    className={cn(
      'flex min-h-10 cursor-text flex-wrap items-center gap-1 p-2',
      className
    )}
    onMouseDown={event => {
      if (event.target === event.currentTarget) {
        event.preventDefault()
        focusInputWithoutScroll(inputRef.current)
      }
    }}
  >
    {children}
    <input
      ref={inputRef}
      value={value}
      onChange={event => {
        onValueChange(event.target.value)
      }}
      className={cn(
        'min-w-[4ch] flex-1 border-0 bg-transparent px-1 py-1 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground',
        inputClassName
      )}
      {...inputProps}
    />
  </div>
)
