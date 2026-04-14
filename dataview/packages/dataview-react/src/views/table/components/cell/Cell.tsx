import { memo, useCallback, useMemo } from 'react'
import type { Field } from '@dataview/core/contracts'
import {
  canQuickToggleFieldValue,
  resolveFieldPrimaryAction
} from '@dataview/core/field'
import {
  type ItemId
} from '@dataview/engine'
import { useDataView } from '@dataview/react/dataview'
import { fieldAttrs } from '@dataview/react/dom/field'
import { useTableContext } from '@dataview/react/views/table/context'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import { cn } from '@shared/ui/utils'
import { CellValue } from '@dataview/react/views/table/components/cell/CellValue'

export interface CellProps {
  itemId: ItemId
  field: Field
}

const same = (left: CellProps, right: CellProps) => (
  left.itemId === right.itemId
  && left.field === right.field
)

const View = (props: CellProps) => {
  const engine = useDataView().engine
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table cell requires an active current view.')
  }
  const showVerticalLinesStore = useMemo(() => engine.active.select(
    state => state?.view.options.table.showVerticalLines ?? false
  ), [engine])
  const showVerticalLines = useStoreValue(showVerticalLinesStore)

  const cell = {
    itemId: props.itemId,
    fieldId: props.field.id
  }
  const cellRef = useCallback((node: HTMLDivElement | null) => {
    table.nodes.registerCell(cell, node)
  }, [cell.itemId, cell.fieldId, table.nodes])
  const cellRender = useKeyedStoreValue(table.cellRender, cell)
  const recordId = currentView.items.get(props.itemId)?.recordId
  const canQuickToggle = canQuickToggleFieldValue(props.field)

  const onQuickToggle = () => {
    const action = resolveFieldPrimaryAction({
      exists: cellRender.exists,
      field: props.field,
      value: cellRender.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    table.gridSelection.set(cell)
    table.focus()
    if (action.value === undefined) {
      engine.active.cells.clear(cell)
      return
    }

    engine.active.cells.set(cell, action.value)
  }

  if (!cellRender.exists || !recordId) {
    return null
  }

  return (
    <div
      ref={cellRef}
      data-table-target="cell"
      data-table-cell="true"
      data-row-id={props.itemId}
      data-field-id={props.field.id}
      {...fieldAttrs({
        viewId: currentView.view.id,
        itemId: props.itemId,
        recordId,
        fieldId: props.field.id
      })}
      role="gridcell"
      aria-selected={cellRender.selected}
      onClick={event => {
        event.stopPropagation()
      }}
      className={cn(
        'relative box-border h-full min-w-0',
        showVerticalLines && 'border-r border-divider'
      )}
    >
      {cellRender.chrome.selection || cellRender.chrome.frame ? (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0',
            cellRender.chrome.selection && 'bg-accent-overlay',
            cellRender.chrome.frame && 'rounded-[2px] border-2 border-accent-frame'
          )}
        />
      ) : null}
      <div
        className={cn(
          'relative z-10 flex h-full min-w-0 items-center gap-2 px-2 outline-none transition-colors',
          cellRender.chrome.hover && 'bg-muted/50'
        )}
      >
        <div className="min-w-0 flex-1">
          <CellValue
            field={props.field}
            value={cellRender.value}
            canQuickToggle={canQuickToggle}
            onQuickToggle={onQuickToggle}
          />
        </div>
      </div>
      {cellRender.chrome.fill ? (
        <button
          type="button"
          aria-label="Fill"
          tabIndex={-1}
          data-table-target="fill-handle"
          data-table-fill-handle="true"
          data-row-id={props.itemId}
          data-field-id={props.field.id}
          className="absolute -bottom-1 -right-1 z-20 h-[9px] w-[9px] box-border cursor-ns-resize rounded-full border-2 border-primary bg-background transition-transform touch-none"
        />
      ) : null}
    </div>
  )
}

export const Cell = memo(View, same)
