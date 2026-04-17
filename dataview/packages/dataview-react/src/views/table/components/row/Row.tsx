import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  DataRecord,
  RecordId,
  Field,
  ViewId
} from '@dataview/core/contracts'
import {
  getRecordFieldValue
} from '@dataview/core/field'
import type { ItemId } from '@dataview/engine'
import type {
  SelectionCommandApi
} from '@dataview/react/runtime/selection'
import {
  createItemListSelectionDomain,
  selectionSnapshot
} from '@dataview/react/runtime/selection'
import { shouldCapturePointer } from '@shared/dom'
import {
  useDataView
} from '@dataview/react/dataview'
import { rowRailState } from '@dataview/react/views/table/model/rowRail'
import { useTableContext } from '@dataview/react/views/table/context'
import { cn } from '@shared/ui/utils'
import { Cell } from '@dataview/react/views/table/components/cell/Cell'
import { RowRail } from '@dataview/react/views/table/components/row/RowRail'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'
import { cellChrome } from '@dataview/react/views/table/model/chrome'
import {
  useKeyedStoreValue,
  useOptionalKeyedStoreValue,
  useStoreValue
} from '@shared/react'

export interface RowProps {
  itemId: ItemId
  recordId?: RecordId
  viewId: ViewId
  measureRef?: (node: HTMLDivElement | null) => void
  showVerticalLines: boolean
  wrap: boolean
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
  && left.measureRef === right.measureRef
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.columns === right.columns
  && left.template === right.template
  && left.rowHeight === right.rowHeight
  && left.marqueeActive === right.marqueeActive
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
  const currentView = useStoreValue(table.currentView)
  const rowNodeRef = useRef<HTMLDivElement | null>(null)
  const selectionDomain = useMemo(() => (
    currentView
      ? createItemListSelectionDomain(currentView.items)
      : undefined
  ), [currentView])

  const rowRef = useCallback((node: HTMLDivElement | null) => {
    rowNodeRef.current = node
    props.measureRef?.(node)
  }, [props.measureRef])

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
      ? selectionSnapshot.contains(selectionDomain, selection, props.itemId)
      : null
  )
  const committedSelected = useKeyedStoreValue(
    dataView.selection.store.membership,
    props.itemId
  )
  const rowRender = useKeyedStoreValue(
    table.rowRender,
    props.itemId
  )
  const record = useOptionalKeyedStoreValue<RecordId, DataRecord | undefined>(
    dataView.engine.select.records.byId,
    props.recordId,
    undefined
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
          selection: table.selection.rows.command,
          rowId: props.itemId,
          shiftKey: event.shiftKey
        })
        table.rowRail.set(props.itemId)
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
        minHeight: props.rowHeight,
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
          className="inline-grid min-w-0 flex-none items-stretch"
          style={{
            gridTemplateColumns: props.template
          }}
        >
          {props.columns.map((field, index) => (
            <Cell
              key={field.id}
              itemId={props.itemId}
              recordId={props.recordId}
              viewId={props.viewId}
              showVerticalLines={props.showVerticalLines}
              wrap={props.wrap}
              field={field}
              value={record
                ? getRecordFieldValue(record, field.id)
                : undefined}
              exists={Boolean(record)}
              selected={(
                rowRender.selectionVisible
                && rowRender.selectedFieldStart !== undefined
                && rowRender.selectedFieldEnd !== undefined
                && index >= rowRender.selectedFieldStart
                && index <= rowRender.selectedFieldEnd
              )}
              chrome={cellChrome({
                selected: (
                  rowRender.selectedFieldStart !== undefined
                  && rowRender.selectedFieldEnd !== undefined
                  && index >= rowRender.selectedFieldStart
                  && index <= rowRender.selectedFieldEnd
                ),
                frameActive: rowRender.focusFieldId === field.id,
                hovered: rowRender.hoverFieldId === field.id,
                fillHandleActive: rowRender.fillFieldId === field.id,
                selectionVisible: rowRender.selectionVisible
              })}
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
