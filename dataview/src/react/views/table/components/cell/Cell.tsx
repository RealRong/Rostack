import { memo, useCallback } from 'react'
import type { GroupProperty } from '@dataview/core/contracts'
import {
  canQuickTogglePropertyValue,
  resolvePropertyPrimaryAction
} from '@dataview/core/property'
import {
  toRecordField
} from '@dataview/engine/projection/view'
import {
  type AppearanceId
} from '@dataview/react/view'
import { useCurrentView, useEngine } from '@dataview/react/editor'
import { fieldAttrs } from '@dataview/react/propertyEdit'
import { useTableContext } from '../../context'
import { useKeyedStoreValue } from '@dataview/react/runtime/store'
import { cn } from '@dataview/react/ui'
import { CellValue } from './CellValue'

export interface CellProps {
  appearanceId: AppearanceId
  property: GroupProperty
}

const same = (left: CellProps, right: CellProps) => (
  left.appearanceId === right.appearanceId
  && left.property === right.property
)

const View = (props: CellProps) => {
  const engine = useEngine()
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table cell requires an active current view.')
  }

  const cell = {
    appearanceId: props.appearanceId,
    propertyId: props.property.id
  }
  const cellRef = useCallback((node: HTMLDivElement | null) => {
    table.nodes.registerCell(cell, node)
  }, [cell.appearanceId, cell.propertyId, table.nodes])
  const cellRender = useKeyedStoreValue(table.cellRender, cell)
  const recordId = currentView.appearances.get(props.appearanceId)?.recordId
  const canQuickToggle = canQuickTogglePropertyValue(props.property)

  const onQuickToggle = () => {
    const action = resolvePropertyPrimaryAction({
      exists: cellRender.exists,
      property: props.property,
      value: cellRender.value
    })
    if (action.kind !== 'quickToggle') {
      return
    }

    const target = toRecordField({
      appearanceId: cell.appearanceId,
      propertyId: cell.propertyId
    }, currentView.appearances)
    if (!target) {
      return
    }

    table.gridSelection.set(cell)
    table.focus()
    if (action.value === undefined) {
      engine.records.clearValue(target.recordId, target.propertyId)
      return
    }

    engine.records.setValue(target.recordId, target.propertyId, action.value)
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
      data-property-id={props.property.id}
      {...fieldAttrs({
        viewId: currentView.view.id,
        appearanceId: props.appearanceId,
        recordId,
        propertyId: props.property.id
      })}
      role="gridcell"
      aria-selected={cellRender.selected}
      onClick={event => {
        event.stopPropagation()
      }}
      className={cn(
        'ui-divider-end relative box-border h-full min-w-0'
      )}
    >
      {cellRender.chrome.selection ? (
        <div
          aria-hidden="true"
          className="ui-accent-overlay pointer-events-none absolute inset-0"
        />
      ) : null}
      {cellRender.chrome.frame ? (
        <div
          aria-hidden="true"
          className="ui-accent-frame pointer-events-none absolute inset-0"
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
            property={props.property}
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
          data-property-id={props.property.id}
          className="ui-accent-handle absolute -bottom-1 -right-1 z-20 h-[9px] w-[9px]"
        />
      ) : null}
    </div>
  )
}

export const Cell = memo(View, same)
