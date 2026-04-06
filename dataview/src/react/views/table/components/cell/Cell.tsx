import { memo, useCallback } from 'react'
import type { Field } from '@dataview/core/contracts'
import {
  canQuickToggleFieldValue,
  isTitleFieldId,
  resolveFieldPrimaryAction
} from '@dataview/core/field'
import {
  toRecordField
} from '@dataview/engine/projection/view'
import {
  type AppearanceId
} from '@dataview/react/runtime/currentView'
import { useCurrentView, useDataView } from '@dataview/react/dataview'
import { fieldAttrs } from '@dataview/dom/field'
import { useTableContext } from '../../context'
import { useKeyedStoreValue } from '@dataview/react/store'
import { cn } from '@ui/utils'
import { CellValue } from './CellValue'

export interface CellProps {
  appearanceId: AppearanceId
  field: Field
}

const same = (left: CellProps, right: CellProps) => (
  left.appearanceId === right.appearanceId
  && left.field === right.field
)

const View = (props: CellProps) => {
  const engine = useDataView().engine
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table cell requires an active current view.')
  }
  const showVerticalLines = currentView.view.options.table.showVerticalLines

  const cell = {
    appearanceId: props.appearanceId,
    fieldId: props.field.id
  }
  const cellRef = useCallback((node: HTMLDivElement | null) => {
    table.nodes.registerCell(cell, node)
  }, [cell.appearanceId, cell.fieldId, table.nodes])
  const cellRender = useKeyedStoreValue(table.cellRender, cell)
  const recordId = currentView.appearances.get(props.appearanceId)?.recordId
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

    const target = toRecordField({
      appearanceId: cell.appearanceId,
      fieldId: cell.fieldId
    }, currentView.appearances)
    if (!target) {
      return
    }

    table.gridSelection.set(cell)
    table.focus()
    if (action.value === undefined) {
      if (isTitleFieldId(target.fieldId)) {
        engine.command({
          type: 'record.apply',
          target: {
            type: 'record',
            recordId: target.recordId
          },
          patch: {
            title: ''
          }
        })
        return
      }

      engine.records.clearValue(target.recordId, target.fieldId)
      return
    }

    if (isTitleFieldId(target.fieldId)) {
      engine.command({
        type: 'record.apply',
        target: {
          type: 'record',
          recordId: target.recordId
        },
        patch: {
          title: String(action.value ?? '')
        }
      })
      return
    }

    engine.records.setValue(target.recordId, target.fieldId, action.value)
  }

  if (!cellRender.exists || !recordId) {
    return null
  }

  return (
    <div
      ref={cellRef}
      data-table-target="cell"
      data-table-cell="true"
      data-row-id={props.appearanceId}
      data-field-id={props.field.id}
      {...fieldAttrs({
        viewId: currentView.view.id,
        appearanceId: props.appearanceId,
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
          data-row-id={props.appearanceId}
          data-field-id={props.field.id}
          className="absolute -bottom-1 -right-1 z-20 h-[9px] w-[9px] box-border cursor-ns-resize rounded-full border-2 border-primary bg-background transition-transform touch-none"
        />
      ) : null}
    </div>
  )
}

export const Cell = memo(View, same)
