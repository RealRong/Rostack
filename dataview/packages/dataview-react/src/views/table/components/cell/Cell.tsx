import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef
} from 'react'
import {
  field as fieldApi
} from '@dataview/core/field'
import type {
  CellRef
} from '@dataview/engine'
import { useDataView } from '@dataview/react/dataview'
import { fieldAttrs } from '@dataview/react/dom/field'
import {
  itemDomBridge
} from '@dataview/react/dom/item'
import { useTableContext } from '@dataview/react/views/table/context'
import { cn } from '@shared/ui/utils'
import { CellValue } from '@dataview/react/views/table/components/cell/CellValue'
import {
  TABLE_CELL_BLOCK_PADDING,
  TABLE_CELL_INLINE_PADDING
} from '@dataview/react/views/table/layout'
import { cellChrome } from '@dataview/react/views/table/model/chrome'
import {
  useKeyedStoreValue
} from '@shared/react'
import {
  sameCellRef
} from '@dataview/runtime'
import type {
  TableCell as TableCellModel
} from '@dataview/runtime'

export interface CellProps {
  cell: CellRef
  showVerticalLines: boolean
  wrap: boolean
}

interface PresentCellProps extends CellProps {
  value: TableCellModel
}

const sameCell = (left: CellProps, right: CellProps) => (
  sameCellRef(left.cell, right.cell)
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
)

const samePresentCell = (left: PresentCellProps, right: PresentCellProps) => (
  sameCell(left, right)
  && left.value === right.value
)

const PresentCellView = (props: PresentCellProps) => {
  const engine = useDataView().engine
  const table = useTableContext()
  const cellNodeRef = useRef<HTMLDivElement | null>(null)
  const chrome = useKeyedStoreValue(table.chrome.cell, props.cell)
  const visual = cellChrome({
    selected: chrome.selected,
    frameActive: chrome.focus,
    hovered: chrome.hover,
    fillHandleActive: chrome.fill,
    selectionVisible: true
  })
  const canQuickToggle = fieldApi.behavior.canQuickToggle(props.value.field)
  const cellRef = useCallback((node: HTMLDivElement | null) => {
    cellNodeRef.current = node
    table.nodes.registerCell(props.cell, node)
  }, [
    props.cell,
    table.nodes
  ])

  useLayoutEffect(() => {
    const node = cellNodeRef.current
    if (!node) {
      return
    }

    itemDomBridge.bind.node(node, props.cell.itemId)

    return () => {
      itemDomBridge.clear.node(node)
    }
  }, [props.cell.itemId])

  const onQuickToggle = () => {
    const action = fieldApi.behavior.primaryAction({
      exists: true,
      field: props.value.field,
      value: props.value.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    table.selection.cells.set(props.cell)
    table.focus()
    if (action.value === undefined) {
      engine.active.cells.clear(props.cell)
      return
    }

    engine.active.cells.set(props.cell, action.value)
  }

  return (
    <div
      ref={cellRef}
      data-table-target="cell"
      data-table-cell="true"
      data-row-id={props.cell.itemId}
      data-field-id={props.value.field.id}
      {...fieldAttrs({
        viewId: props.value.viewId,
        itemId: props.cell.itemId,
        recordId: props.value.recordId,
        fieldId: props.value.field.id
      })}
      role="gridcell"
      aria-selected={chrome.selected}
      onClick={event => {
        event.stopPropagation()
      }}
      className={cn(
        'relative box-border h-full min-w-0',
        props.showVerticalLines && 'border-r border-divider'
      )}
    >
      {visual.selection || visual.frame ? (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0',
            visual.selection && 'bg-accent-overlay',
            visual.frame && 'rounded-[2px] border-2 border-accent-frame'
          )}
        />
      ) : null}
      <div
        className={cn(
          'relative z-10 box-border flex min-h-full min-w-0 items-start gap-2 outline-none transition-colors',
          visual.hover && 'bg-muted/50'
        )}
        style={{
          paddingInline: TABLE_CELL_INLINE_PADDING,
          paddingBlock: TABLE_CELL_BLOCK_PADDING
        }}
      >
        <div className="min-w-0 flex-1">
          <CellValue
            field={props.value.field}
            value={props.value.value}
            canQuickToggle={canQuickToggle}
            onQuickToggle={onQuickToggle}
            wrap={props.wrap}
          />
        </div>
      </div>
      {visual.fill ? (
        <button
          type="button"
          aria-label="Fill"
          tabIndex={-1}
          data-table-target="fill-handle"
          data-table-fill-handle="true"
          data-row-id={props.cell.itemId}
          data-field-id={props.value.field.id}
          className="absolute -bottom-1 -right-1 z-20 h-[9px] w-[9px] box-border cursor-ns-resize rounded-full border-2 border-primary bg-background transition-transform touch-none"
        />
      ) : null}
    </div>
  )
}

const PresentCell = memo(PresentCellView, samePresentCell)

const CellSlotView = (props: CellProps) => {
  const dataView = useDataView()
  const value = useKeyedStoreValue(
    dataView.model.table.cell,
    props.cell
  )

  if (!value) {
    return null
  }

  return (
    <PresentCell
      {...props}
      value={value}
    />
  )
}

export const Cell = memo(CellSlotView, sameCell)
