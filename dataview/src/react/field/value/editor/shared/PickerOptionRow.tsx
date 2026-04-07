import type { ReactNode } from 'react'
import { cn } from '@ui/utils'

export interface PickerOptionRowProps {
  id?: string
  rowRef?: (node: HTMLDivElement | null) => void
  highlighted?: boolean
  open?: boolean
  dragging?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
  children: ReactNode
  onHighlight?: () => void
  onSelect?: () => void
}

export const PickerOptionRow = (props: PickerOptionRowProps) => (
  <div
    id={props.id}
    ref={props.rowRef}
    className={cn(
      'group/option flex h-8 items-center gap-1 rounded-lg px-1.5 py-1 transition-colors',
      props.onSelect && 'cursor-pointer',
      props.dragging && 'opacity-70',
      (props.open || props.highlighted) && 'bg-[var(--ui-control-hover)]',
      props.className
    )}
    onMouseDown={event => {
      event.preventDefault()
    }}
    onMouseEnter={props.onHighlight}
    onClick={event => {
      if (!props.onSelect) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      props.onSelect()
    }}
  >
    {props.leading}
    <div className="min-w-0 flex-1 flex items-center">
      {props.children}
    </div>
    {props.trailing ? (
      <span className={cn(
        'shrink-0 opacity-0 flex items-center transition-opacity group-hover/option:opacity-100',
        (props.open || props.highlighted) && 'opacity-100'
      )}>
        {props.trailing}
      </span>
    ) : null}
  </div>
)
