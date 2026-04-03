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

const TABLE_SELECTION_INSET = (
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
  onSelectionPointerStart: (event: PointerEvent<HTMLButtonElement>) => void
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
      className="ui-handle pointer-events-auto inline-flex cursor-grab items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-muted/70 active:cursor-grabbing"
      style={{
        width: TABLE_REORDER_HANDLE_SIZE,
        height: TABLE_REORDER_HANDLE_SIZE
      }}
      aria-label="Drag row"
      title="Drag row"
    >
      <GripVertical size={16} strokeWidth={1.8} />
    </button>
  )
}

export interface RowSelectionButtonProps {
  selected: boolean
  indeterminate?: boolean
  disabled?: boolean
  label?: string
  className?: string
  onPointerStart: (event: PointerEvent<HTMLButtonElement>) => void
}

export const RowSelectionButton = (props: RowSelectionButtonProps) => {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onPointerDown={event => {
        if (props.disabled) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        props.onPointerStart(event)
      }}
      className={cn(
        'pointer-events-auto inline-flex h-4 w-4 items-center justify-center rounded-[3px] border text-[10px] transition-colors',
        props.className,
        props.selected || props.indeterminate
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-[rgb(196,196,196)] bg-background text-transparent hover:border-muted-foreground/60',
        props.disabled && 'cursor-default border-border bg-muted text-transparent opacity-50 hover:border-border'
      )}
      aria-checked={props.indeterminate ? 'mixed' : props.selected}
      aria-label={props.label ?? 'Select row'}
      title={props.label ?? 'Select row'}
    >
      {props.indeterminate ? (
        <span className="block h-px w-2 rounded-full bg-current" />
      ) : (
        <span className={cn(props.selected ? 'opacity-100' : 'opacity-0')}>✓</span>
      )}
    </button>
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
            width: TABLE_SURFACE_LEADING_OFFSET,
            marginLeft: -TABLE_SURFACE_LEADING_OFFSET,
            gap: TABLE_REORDER_RAIL_GAP,
            paddingRight: TABLE_SELECTION_INSET
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
          {props.selection ? (
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: TABLE_SELECTION_SLOT_WIDTH
              }}
            >
              {props.selection}
            </div>
          ) : null}
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
