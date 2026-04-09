import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  AppearanceId
} from '@dataview/engine/project'
import type {
  SelectionApi
} from '@dataview/react/runtime/selection'
import { shouldCapturePointer } from '@shared/dom'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { rowRailState } from '../../model/rowRail'
import { useTableContext } from '../../context'
import { useStoreValue } from '@shared/react'
import { cn } from '@ui/utils'
import { Cell } from '../cell/Cell'
import { RowRail } from './RowRail'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'

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

export const applyRowCheckboxSelection = (input: {
  selection: Pick<SelectionApi, 'extend' | 'toggle'>
  rowId: AppearanceId
  shiftKey: boolean
}) => {
  if (input.shiftKey) {
    input.selection.extend(input.rowId)
    return
  }

  input.selection.toggle([input.rowId])
}

const View = (props: RowProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table row requires an active current view.')
  }
  const columns = currentView.fields.all
  const rowNodeRef = useRef<HTMLDivElement | null>(null)

  const rowRef = useCallback((node: HTMLDivElement | null) => {
    rowNodeRef.current = node
  }, [])

  useLayoutEffect(() => {
    const node = rowNodeRef.current
    if (!node) {
      return
    }

    table.nodes.registerRow(props.appearanceId, node)

    return () => {
      table.nodes.registerRow(props.appearanceId, null)
    }
  }, [props.appearanceId, table.nodes])
  const capabilities = useStoreValue(table.capabilities)
  const rowRail = useStoreValue(table.rowRail)
  const exposed = rowRail === props.appearanceId
  const previewSelected = useStoreSelector(
    table.marqueeSelection,
    selection => selection
      ? selection.ids.includes(props.appearanceId)
      : null
  )
  const committedSelected = useDataViewValue(
    dataView => dataView.selection.store,
    selection => selection.ids.includes(props.appearanceId)
  )
  const selected = previewSelected ?? committedSelected
  const rail = rowRailState({
    dragActive: props.dragActive,
    dragDisabled: !capabilities.canRowDrag,
    marqueeActive: props.marqueeActive,
    exposed,
    selected
  })
  const rowTone = cn(
    props.isDragging && 'bg-muted/60 opacity-40',
    selected && 'bg-accent-overlay'
  )

  const onRowPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !shouldCapturePointer(event.target, event.currentTarget)) {
      return
    }

    event.preventDefault()
  }, [])

  const onSelectionPointerStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    table.interaction.start({
      mode: 'pointer',
      gesture: 'row-select',
      event,
      capture: false,
      up: () => {
        applyRowCheckboxSelection({
          selection: dataView.selection,
          rowId: props.appearanceId,
          shiftKey: event.shiftKey
        })
        table.gridSelection.clear()
        table.rowRail.set(props.appearanceId)
        table.focus()
      }
    })
  }, [dataView.selection, props.appearanceId, table])

  return (
    <div
      ref={rowRef}
      data-table-target="row"
      data-row-id={props.appearanceId}
      role="row"
      aria-selected={selected}
      onPointerDown={onRowPointerDown}
      className="relative border-b border-divider text-sm text-foreground transition-colors focus:outline-none"
      style={{
        height: props.rowHeight,
        boxSizing: 'border-box'
      }}
    >
      <RowRail
        rowId={props.appearanceId}
        selected={selected}
        state={rail}
        marqueeActive={props.marqueeActive}
        onSelectionPointerStart={onSelectionPointerStart}
        onDragPointerStart={event => {
          table.rowRail.set(null)
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
        {columns.map(field => (
          <Cell
            key={field.id}
            appearanceId={props.appearanceId}
            field={field}
          />
        ))}
      </div>
    </div>
  )
}

export const Row = memo(View, same)
