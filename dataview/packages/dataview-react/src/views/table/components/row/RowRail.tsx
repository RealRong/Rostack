import { GripVertical } from 'lucide-react'
import type { PointerEvent, ReactNode } from 'react'
import type { ItemId } from '@dataview/engine'
import {
  type RowRailState,
  type RowRailStateInput
} from '#dataview-react/views/table/model/rowRail'
import { Checkbox } from '@shared/ui/checkbox'
import { cn } from '@shared/ui/utils'
import {
  TABLE_REORDER_HANDLE_SIZE,
  TABLE_REORDER_RAIL_GAP,
  TABLE_REORDER_RAIL_WIDTH,
  TABLE_SELECTION_SLOT_WIDTH,
  TABLE_SURFACE_LEADING_OFFSET
} from '#dataview-react/views/table/layout'

export const TABLE_SELECTION_INSET = (
  TABLE_SURFACE_LEADING_OFFSET
  - TABLE_REORDER_RAIL_WIDTH
  - TABLE_REORDER_RAIL_GAP
  - TABLE_SELECTION_SLOT_WIDTH
)

export type { RowRailState, RowRailStateInput }

export interface RowRailProps {
  rowId: ItemId
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
    <div onPointerDown={event => {
      if (props.disabled) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      props.onPointerStart(event)
    }} className='flex h-full pointer-events-auto cursor-pointer shrink-0 items-center justify-center' style={{
      width: TABLE_SELECTION_SLOT_WIDTH + TABLE_SELECTION_INSET * 2
    }}>
      <Checkbox
        checked={props.selected}
        indeterminate={props.indeterminate}
        disabled={props.disabled}
        aria-label={props.label ?? 'Select row'}
        title={props.label ?? 'Select row'}
        className={cn(
          'pointer-events-auto',
          props.className,
        )}
      />
    </div>

  )
}

export interface TableLeadingRailProps {
  rowId?: ItemId
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
