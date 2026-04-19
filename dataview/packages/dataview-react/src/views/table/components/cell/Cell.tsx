import {
  memo,
  useCallback
} from 'react'
import type { Field, RecordId, ViewId } from '@dataview/core/contracts'
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

export interface CellProps {
  itemId: ItemId
  recordId?: RecordId
  viewId: ViewId
  showVerticalLines: boolean
  wrap: boolean
  field: Field
  value: unknown
  exists: boolean
}

const same = (left: CellProps, right: CellProps) => (
  left.itemId === right.itemId
  && left.recordId === right.recordId
  && left.viewId === right.viewId
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.field === right.field
  && left.exists === right.exists
  && Object.is(left.value, right.value)
)

const View = (props: CellProps) => {
  const engine = useDataView().engine
  const table = useTableContext()
  const chrome = useKeyedStoreValue(table.chrome.cell, {
    itemId: props.itemId,
    fieldId: props.field.id
  })
  const visual = cellChrome({
    selected: chrome.selected,
    frameActive: chrome.focus,
    hovered: chrome.hover,
    fillHandleActive: chrome.fill,
    selectionVisible: true
  })
  const canQuickToggle = canQuickToggleFieldValue(props.field)
  const cellRef = useCallback((node: HTMLDivElement | null) => {
    table.nodes.registerCell({
      itemId: props.itemId,
      fieldId: props.field.id
    }, node)
  }, [
    props.field.id,
    props.itemId,
    table.nodes
  ])

  const onQuickToggle = () => {
    const action = resolveFieldPrimaryAction({
      exists: props.exists,
      field: props.field,
      value: props.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    table.selection.cells.set({
      itemId: props.itemId,
      fieldId: props.field.id
    })
    table.focus()
    if (action.value === undefined) {
      engine.active.cells.clear({
        itemId: props.itemId,
        fieldId: props.field.id
      })
      return
    }

    engine.active.cells.set({
      itemId: props.itemId,
      fieldId: props.field.id
    }, action.value)
  }

  if (!props.exists || !props.recordId) {
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
        viewId: props.viewId,
        itemId: props.itemId,
        recordId: props.recordId,
        fieldId: props.field.id
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
            field={props.field}
            value={props.value}
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
          data-row-id={props.itemId}
          data-field-id={props.field.id}
          className="absolute -bottom-1 -right-1 z-20 h-[9px] w-[9px] box-border cursor-ns-resize rounded-full border-2 border-primary bg-background transition-transform touch-none"
        />
      ) : null}
    </div>
  )
}

export const Cell = memo(View, same)
