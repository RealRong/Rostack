import { GripVertical } from 'lucide-react'
import type { PointerEvent } from 'react'
import type { ItemId } from '@dataview/engine'
import {
  type RowRailState,
  type RowRailStateInput
} from '@dataview/react/views/table/model/rowRail'
import { Checkbox } from '@shared/ui/checkbox'
import { cn } from '@shared/ui/utils'
import {
  TABLE_REORDER_GUTTER_WIDTH,
  TABLE_REORDER_HANDLE_SIZE,
  TABLE_SELECTION_CHECKBOX_SIZE,
  TABLE_SELECTION_COLUMN_WIDTH
} from '@dataview/react/views/table/layout'

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
  visible: boolean
  onPointerStart: (event: PointerEvent<HTMLButtonElement>) => void
}

export const DragHandle = (props: DragHandleProps) => {
  if (!props.visible) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 flex items-center justify-end"
      style={{
        left: -TABLE_REORDER_GUTTER_WIDTH * 2,
        width: TABLE_REORDER_GUTTER_WIDTH
      }}
    >
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
    </div>
  )
}

export interface RowSelectionButtonProps {
  rowId?: ItemId
  selected: boolean
  indeterminate?: boolean
  disabled?: boolean
  label?: string
  className?: string
  showOnHover?: boolean
  onPointerStart?: (event: PointerEvent<HTMLElement>) => void
  onPress?: () => void
}

export const RowSelectionButton = (props: RowSelectionButtonProps) => {
  const visible = props.selected || props.indeterminate || !props.showOnHover

  return (
    <div
      className="sticky z-20 h-full w-0 overflow-visible"
      style={{
        insetInlineStart: TABLE_SELECTION_COLUMN_WIDTH
      }}
    >
      <div
        data-table-target={props.rowId ? 'row-rail' : undefined}
        data-row-rail-row-id={props.rowId}
        data-row-id={props.rowId}
        onPointerDown={event => {
          if (props.disabled) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          props.onPointerStart?.(event)
        }}
        onClick={event => {
          if (props.disabled || !props.onPress) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          props.onPress()
        }}
        className={cn(
          'absolute flex items-center justify-center bg-canvas cursor-pointer',
          props.showOnHover && 'group/row-selection',
          props.className
        )}
        style={{
          insetInlineStart: -TABLE_SELECTION_COLUMN_WIDTH,
          insetBlockStart: 0,
          width: TABLE_SELECTION_COLUMN_WIDTH,
          height: TABLE_SELECTION_COLUMN_WIDTH
        }}
      >
        <Checkbox
          checked={props.selected}
          indeterminate={props.indeterminate}
          disabled={props.disabled}
          aria-label={props.label ?? 'Select row'}
          title={props.label ?? 'Select row'}
          className={cn(
            'pointer-events-auto',
            props.showOnHover && (
              visible
                ? 'opacity-100'
                : 'opacity-0 group-hover/row-selection:opacity-100 group-focus-within/row-selection:opacity-100'
            )
          )}
          style={{
            width: TABLE_SELECTION_CHECKBOX_SIZE,
            height: TABLE_SELECTION_CHECKBOX_SIZE
          }}
        />
      </div>
    </div>
  )
}

export const RowRail = (props: RowRailProps) => {
  return (
    <>
      <DragHandle
        visible={props.state.drag === 'visible'}
        onPointerStart={props.onDragPointerStart}
      />
      <RowSelectionButton
        rowId={props.rowId}
        selected={props.selected}
        onPointerStart={props.onSelectionPointerStart}
        className={cn(
          props.state.selection === 'visible'
            ? 'opacity-100'
            : 'opacity-0',
          props.marqueeActive && 'pointer-events-none'
        )}
      />
    </>
  )
}
