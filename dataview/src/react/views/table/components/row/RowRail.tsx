import { GripVertical } from 'lucide-react'
import type { PointerEvent, ReactNode } from 'react'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import {
  type RowRailState,
  type RowRailStateInput
} from '../../model/rowRail'
import { cn } from '@ui/utils'
import {
  TABLE_REORDER_HANDLE_SIZE,
  TABLE_REORDER_RAIL_GAP,
  TABLE_REORDER_RAIL_WIDTH,
  TABLE_SELECTION_SLOT_WIDTH,
  TABLE_SURFACE_LEADING_OFFSET
} from '../../layout'

export const TABLE_SELECTION_INSET = (
  TABLE_SURFACE_LEADING_OFFSET
  - TABLE_REORDER_RAIL_WIDTH
  - TABLE_REORDER_RAIL_GAP
  - TABLE_SELECTION_SLOT_WIDTH
)

export type { RowRailState, RowRailStateInput }

export interface RowRailProps {
  rowId: AppearanceId
  selected: boolean
  state: RowRailState
  marqueeActive: boolean
  onSelectionPointerStart: (event: PointerEvent<HTMLElement>) => void
  onDragPointerStart: (event: PointerEvent<HTMLButtonElement>) => void
}

export interface DragHandleProps {
  onPointerStart: (event: PointerEvent<HTMLButtonElement>) => void
}

export const DragHandle = (props: DragHandleProps) => {
  return (
    <button
      type="button"
      onPointerDown={event => {
        event.preventDefault()
        event.stopPropagation()
        props.onPointerStart(event)
      }}
      className="pointer-events-auto inline-flex cursor-grab items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-all hover:bg-hover active:cursor-grabbing"
      style={{
        width: TABLE_REORDER_HANDLE_SIZE,
        height: TABLE_REORDER_HANDLE_SIZE + 4
      }}
      aria-label="Drag row"
      title="Drag row"
    >
      <GripVertical size={18} strokeWidth={1.8} />
    </button>
  )
}

export interface RowSelectionButtonProps {
  selected: boolean
  indeterminate?: boolean
  disabled?: boolean
  label?: string
  className?: string
  onPointerStart: (event: PointerEvent<HTMLElement>) => void
}

export const RowSelectionButton = (props: RowSelectionButtonProps) => {
  return (
    <div className='flex h-full pointer-events-auto cursor-pointer shrink-0 items-center justify-center' style={{
      width: TABLE_SELECTION_SLOT_WIDTH + TABLE_SELECTION_INSET * 2
    }} onPointerDown={event => {
      if (props.disabled) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      props.onPointerStart(event)
    }}>
      <button
        aria-checked={props.indeterminate ? 'mixed' : props.selected}
        aria-label={props.label ?? 'Select row'}
        title={props.label ?? 'Select row'}
        type="button"
        disabled={props.disabled}
        className={cn(
          'pointer-events-auto size-[16px] inline-flex items-center justify-center rounded border text-sm transition-colors',
          props.className,
          props.selected || props.indeterminate
            ? 'border-primary bg-primary text-primary-foreground'
            : 'text-transparent hover:bg-hover',
          props.disabled && 'cursor-default border-border bg-muted text-transparent opacity-50 hover:border-border'
        )}
      >
        {props.indeterminate ? (
          <span className="block h-px w-2 text-white rounded-full bg-current" />
        ) : (
          <span className={cn(props.selected ? 'opacity-100' : 'opacity-0', 'text-white')}>✓</span>
        )}
      </button>
    </div>

  )
}

export interface TableLeadingRailProps {
  rowId?: AppearanceId
  className?: string
  leading?: ReactNode
  selection?: ReactNode
}

export const TableLeadingRail = (props: TableLeadingRailProps) => {
  return (
    <div
      data-row-rail-row-id={props.rowId}
      data-row-id={props.rowId}
      {...(props.rowId ? { 'data-table-target': 'row-rail' as const } : {})}
      className={cn(
        'pointer-events-none absolute inset-y-0 left-0 right-0 z-10 overflow-visible',
        props.className
      )}
    >
      <div
        className="sticky h-full w-0 overflow-visible"
        style={{
          left: TABLE_SURFACE_LEADING_OFFSET
        }}
      >
        <div
          className="flex h-full items-center justify-end"
          style={{
            marginLeft: -TABLE_SURFACE_LEADING_OFFSET
          }}
        >
          {props.leading ? (
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: TABLE_REORDER_RAIL_WIDTH
              }}
            >
              {props.leading}
            </div>
          ) : null}
          {props.selection}
        </div>
      </div>
    </div>
  )
}

export const RowRail = (props: RowRailProps) => {
  return (
    <TableLeadingRail
      rowId={props.rowId}
      leading={props.state.drag === 'visible'
        ? (
          <DragHandle onPointerStart={props.onDragPointerStart} />
        )
        : undefined}
      selection={props.state.selection !== 'hidden'
        ? (
          <RowSelectionButton
            selected={props.selected}
            onPointerStart={props.onSelectionPointerStart}
            className={cn(
              props.state.selection === 'visible'
                ? 'opacity-100'
                : 'opacity-0',
              props.marqueeActive && 'pointer-events-none'
            )}
          />
        )
        : undefined}
    />
  )
}
