import {
  memo,
  useCallback,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  AppearanceId,
  CurrentView
} from '@dataview/react/view'
import { shouldCapturePointer } from '@dataview/react/dom/interactive'
import { useCurrentView } from '@dataview/react/editor'
import { rowRailState } from '../../model/rowRail'
import { useTableContext } from '../../context'
import { useKeyedStoreValue, useStoreValue } from '@dataview/react/runtime/store'
import { cn } from '@ui/utils'
import { Cell } from '../cell/Cell'
import { RowRail } from './RowRail'

export interface RowProps {
  appearanceId: AppearanceId
  template: string
  rowHeight: number
  marqueeActive: boolean
  dragActive: boolean
  isDragging: boolean
  onDragStart: (input: {
    rowId: AppearanceId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
}

const same = (left: RowProps, right: RowProps) => (
  left.appearanceId === right.appearanceId
  && left.template === right.template
  && left.rowHeight === right.rowHeight
  && left.marqueeActive === right.marqueeActive
  && left.dragActive === right.dragActive
  && left.isDragging === right.isDragging
  && left.onDragStart === right.onDragStart
)

const useRowSelection = (rowId: AppearanceId) => {
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table row requires an active current view.')
  }

  const currentSelection = useStoreValue(currentView.selection)

  return {
    selected: currentSelection.ids.includes(rowId)
  }
}

export const applyRowCheckboxSelection = (input: {
  currentView: Pick<CurrentView, 'commands'>
  rowId: AppearanceId
  shiftKey: boolean
}) => {
  if (input.shiftKey) {
    input.currentView.commands.selection.extend(input.rowId)
    return
  }

  input.currentView.commands.selection.toggle([input.rowId])
}

const View = (props: RowProps) => {
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table row requires an active current view.')
  }
  const columns = currentView.properties.all

  const rowRef = useCallback((node: HTMLDivElement | null) => {
    table.nodes.registerRow(props.appearanceId, node)
  }, [props.appearanceId, table.nodes])
  const capabilities = useStoreValue(table.capabilities)
  const rawHovered = useKeyedStoreValue(table.hover.row, props.appearanceId)
  const hovered = capabilities.canHover && rawHovered
  const rowSelection = useRowSelection(props.appearanceId)
  const rail = rowRailState({
    dragActive: props.dragActive,
    dragDisabled: !capabilities.canRowDrag,
    marqueeActive: props.marqueeActive,
    hovered,
    selected: rowSelection.selected
  })
  const rowTone = cn(
    props.isDragging && 'bg-muted/60 opacity-40',
    rowSelection.selected && 'ui-accent-overlay'
  )

  const onRowPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !shouldCapturePointer(event.target, event.currentTarget)) {
      return
    }

    event.preventDefault()
  }, [])

  const onSelectionPointerStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    table.interaction.start({
      mode: 'pointer',
      gesture: 'row-select',
      event,
      up: () => {
        applyRowCheckboxSelection({
          currentView,
          rowId: props.appearanceId,
          shiftKey: event.shiftKey
        })
        table.gridSelection.clear()
        table.focus()
      }
    })
  }, [currentView, props.appearanceId, table])

  return (
    <div
      ref={rowRef}
      data-table-target="row"
      data-row-id={props.appearanceId}
      role="row"
      aria-selected={rowSelection.selected}
      onPointerDown={onRowPointerDown}
      className="ui-divider-bottom relative text-sm text-foreground transition-colors focus:outline-none"
      style={{
        height: props.rowHeight,
        boxSizing: 'border-box'
      }}
    >
      <RowRail
        rowId={props.appearanceId}
        selected={rowSelection.selected}
        state={rail}
        marqueeActive={props.marqueeActive}
        onSelectionPointerStart={onSelectionPointerStart}
        onDragPointerStart={event => {
          props.onDragStart({
            rowId: props.appearanceId,
            event
          })
        }}
      />
      <div
        className={cn(
          'grid h-full min-w-0 items-center',
          rowTone
        )}
        style={{
          gridTemplateColumns: props.template
        }}
      >
        {columns.map(property => (
          <Cell
            key={property.id}
            appearanceId={props.appearanceId}
            property={property}
          />
        ))}
      </div>
    </div>
  )
}

export const Row = memo(View, same)
