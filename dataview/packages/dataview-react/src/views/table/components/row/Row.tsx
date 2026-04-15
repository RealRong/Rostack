import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  RecordId,
  Field,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import type {
  SelectionApi
} from '@dataview/react/runtime/selection'
import { readSelectionIdSet } from '@dataview/react/runtime/selection/store'
import { shouldCapturePointer } from '@shared/dom'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { rowRailState } from '@dataview/react/views/table/model/rowRail'
import { useTableContext } from '@dataview/react/views/table/context'
import { cn } from '@shared/ui/utils'
import { Cell } from '@dataview/react/views/table/components/cell/Cell'
import { RowRail } from '@dataview/react/views/table/components/row/RowRail'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'

export interface RowProps {
  itemId: ItemId
  recordId?: RecordId
  viewId: ViewId
  showVerticalLines: boolean
  columns: readonly Field[]
  template: string
  rowHeight: number
  marqueeActive: boolean
  dragActive: boolean
  isDragging: boolean
  onDragStart: (input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
}

const same = (left: RowProps, right: RowProps) => (
  left.itemId === right.itemId
  && left.recordId === right.recordId
  && left.viewId === right.viewId
  && left.showVerticalLines === right.showVerticalLines
  && left.columns === right.columns
  && left.template === right.template
  && left.rowHeight === right.rowHeight
  && left.marqueeActive === right.marqueeActive
  && left.dragActive === right.dragActive
  && left.isDragging === right.isDragging
  && left.onDragStart === right.onDragStart
)

export const applyRowCheckboxSelection = (input: {
  selection: Pick<SelectionApi, 'extend' | 'toggle'>
  rowId: ItemId
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
  const rowNodeRef = useRef<HTMLDivElement | null>(null)

  const rowRef = useCallback((node: HTMLDivElement | null) => {
    rowNodeRef.current = node
  }, [])

  useLayoutEffect(() => {
    const node = rowNodeRef.current
    if (!node) {
      return
    }

    table.nodes.registerRow(props.itemId, node)

    return () => {
      table.nodes.registerRow(props.itemId, null)
    }
  }, [props.itemId, table.nodes])
  const canRowDrag = useStoreSelector(
    table.capabilities,
    capabilities => capabilities.canRowDrag
  )
  const exposed = useStoreSelector(
    table.rowRail,
    rowId => rowId === props.itemId
  )
  const previewSelected = useStoreSelector(
    table.marqueeSelection,
    selection => selection
      ? readSelectionIdSet(selection).has(props.itemId)
      : null
  )
  const committedSelected = useDataViewValue(
    dataView => dataView.selection.store,
    selection => readSelectionIdSet(selection).has(props.itemId)
  )
  const selected = previewSelected ?? committedSelected
  const rail = rowRailState({
    dragActive: props.dragActive,
    dragDisabled: !canRowDrag,
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
          selection: table.selection.rows,
          rowId: props.itemId,
          shiftKey: event.shiftKey
        })
        table.rowRail.set(props.itemId)
        table.focus()
      }
    })
  }, [dataView.selection, props.itemId, table])

  return (
    <div
      ref={rowRef}
      data-table-target="row"
      data-row-id={props.itemId}
      role="row"
      aria-selected={selected}
      onPointerDown={onRowPointerDown}
      className="relative min-w-full w-max border-b border-divider text-sm text-foreground transition-colors focus:outline-none"
      style={{
        height: props.rowHeight,
        boxSizing: 'border-box'
      }}
    >
      <RowRail
        rowId={props.itemId}
        selected={selected}
        state={rail}
        marqueeActive={props.marqueeActive}
        onSelectionPointerStart={onSelectionPointerStart}
        onDragPointerStart={event => {
          table.rowRail.set(null)
          props.onDragStart({
            rowId: props.itemId,
            event
          })
        }}
      />
      <div
        className={cn(
          'flex h-full min-w-full w-max items-stretch',
          rowTone
        )}
      >
        <div
          className="inline-grid h-full min-w-0 flex-none items-center"
          style={{
            gridTemplateColumns: props.template
          }}
        >
          {props.columns.map(field => (
            <Cell
              key={field.id}
              itemId={props.itemId}
              recordId={props.recordId}
              viewId={props.viewId}
              showVerticalLines={props.showVerticalLines}
              field={field}
            />
          ))}
        </div>
        <div
          className="shrink-0"
          aria-hidden="true"
          style={{
            width: TABLE_TRAILING_ACTION_WIDTH
          }}
        />
      </div>
    </div>
  )
}

export const Row = memo(View, same)
