import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  DataRecord,
  RecordId
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import type { ItemId } from '@dataview/engine'
import type {
  SelectionCommandApi
} from '@dataview/runtime/selection'
import { shouldCapturePointer } from '@shared/dom'
import {
  useDataView
} from '@dataview/react/dataview'
import { rowRailState } from '@dataview/react/views/table/model/rowRail'
import { useTableContext } from '@dataview/react/views/table/context'
import { cn } from '@shared/ui/utils'
import { Cell } from '@dataview/react/views/table/components/cell/Cell'
import { RowRail } from '@dataview/react/views/table/components/row/RowRail'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'
import {
  useKeyedStoreValue,
  useOptionalKeyedStoreValue,
  useStoreValue
} from '@shared/react'

export interface RowProps {
  itemId: ItemId
  measureRef?: (node: HTMLDivElement | null) => void
  template: string
  dragActive: boolean
  isDragging: boolean
  onDragStart: (input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
}

const same = (left: RowProps, right: RowProps) => (
  left.itemId === right.itemId
  && left.measureRef === right.measureRef
  && left.template === right.template
  && left.dragActive === right.dragActive
  && left.isDragging === right.isDragging
  && left.onDragStart === right.onDragStart
)

export const applyRowCheckboxSelection = (input: {
  selection: Pick<SelectionCommandApi<ItemId>, 'range' | 'ids'>
  rowId: ItemId
  shiftKey: boolean
}) => {
  if (input.shiftKey) {
    input.selection.range.extendTo(input.rowId)
    return
  }

  input.selection.ids.toggle([input.rowId])
}

const View = (props: RowProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const rowNodeRef = useRef<HTMLDivElement | null>(null)
  const body = useStoreValue(table.body)
  const currentView = useStoreValue(table.currentView)

  const rowRef = useCallback((node: HTMLDivElement | null) => {
    rowNodeRef.current = node
    props.measureRef?.(node)
  }, [props.measureRef])

  if (!body || !currentView) {
    throw new Error('Table row requires an active body and current view.')
  }

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
  const row = useKeyedStoreValue(
    table.chrome.row,
    props.itemId
  )
  const recordId = currentView.items.get(props.itemId)?.recordId
  const record = useOptionalKeyedStoreValue<RecordId, DataRecord | undefined>(
    dataView.engine.source.doc.records,
    recordId,
    undefined
  )
  const selected = row.selected
  const rail = rowRailState({
    dragActive: props.dragActive,
    dragDisabled: !row.canDrag,
    marqueeActive: body.marqueeActive,
    exposed: row.exposed,
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
          selection: table.selection.rows.command,
          rowId: props.itemId,
          shiftKey: event.shiftKey
        })
        table.rail.set(props.itemId)
        table.focus()
      }
    })
  }, [props.itemId, table])

  return (
    <div
      ref={rowRef}
      data-table-target="row"
      data-row-id={props.itemId}
      role="row"
      aria-selected={selected}
      onPointerDown={onRowPointerDown}
      className="relative self-stretch min-w-full w-max border-b border-divider text-sm text-foreground transition-colors focus:outline-none"
      style={{
        minHeight: table.layout.rowHeight,
        boxSizing: 'border-box'
      }}
    >
      <div
        className={cn(
          'flex min-w-full w-max items-stretch',
          rowTone
        )}
      >
        <RowRail
          rowId={props.itemId}
          selected={selected}
          state={rail}
          marqueeActive={body.marqueeActive}
          onSelectionPointerStart={onSelectionPointerStart}
          onDragPointerStart={event => {
            table.rail.set(null)
            props.onDragStart({
              rowId: props.itemId,
              event
            })
          }}
        />
        <div
          className="inline-grid min-w-0 flex-none items-stretch"
          style={{
            gridTemplateColumns: props.template
          }}
        >
          {body.columns.map(field => (
            <Cell
              key={field.id}
              itemId={props.itemId}
              recordId={recordId}
              viewId={body.viewId}
              showVerticalLines={body.showVerticalLines}
              wrap={body.wrap}
              field={field}
              value={record
                ? fieldApi.value.read(record, field.id)
                : undefined}
              exists={Boolean(record)}
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
