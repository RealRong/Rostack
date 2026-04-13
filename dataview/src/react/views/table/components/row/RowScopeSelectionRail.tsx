import {
  memo,
  useCallback,
  type PointerEvent
} from 'react'
import {
  selection
} from '@dataview/react/runtime/selection'
import type {
  ItemId
} from '@dataview/engine'
import {
  useDataView,
  useDataViewValue,
} from '@dataview/react/dataview'
import { useStoreValue } from '@shared/react'
import { useTableContext } from '../../context'
import { RowSelectionButton, TableLeadingRail } from './RowRail'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
export interface RowScopeSelectionRailProps {
  rowIds: readonly ItemId[]
  label?: string
}

const View = (props: RowScopeSelectionRailProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table row scope selection requires an active current view.')
  }

  const previewSelection = useStoreSelector(
    table.marqueeSelection,
    selection => selection
  )
  const committedSelection = useDataViewValue(
    dataView => dataView.selection.store
  )
  const currentSelection = previewSelection ?? committedSelection
  const selectedRowIds = currentSelection.ids
  const selectedRowIdSet = new Set(selectedRowIds)
  const rowCount = props.rowIds.length
  const selectedRowCount = props.rowIds.reduce((count, rowId) => (
    selectedRowIdSet.has(rowId)
      ? count + 1
      : count
  ), 0)
  const allSelected = rowCount > 0 && selectedRowCount === rowCount
  const someSelected = selectedRowCount > 0 && !allSelected
  const disabled = rowCount === 0

  const onPointerStart = useCallback((event: PointerEvent<HTMLElement>) => {
    table.interaction.start({
      mode: 'pointer',
      gesture: 'row-select',
      event,
      capture: false,
      up: () => {
        if (allSelected) {
          const scopeSet = new Set(props.rowIds)
          const nextIds = currentSelection.ids.filter(rowId => !scopeSet.has(rowId))
          dataView.selection.set(nextIds, {
            anchor: currentSelection.anchor,
            focus: currentSelection.focus
          })
        } else {
          const nextIds = selection.normalize(currentView.items.ids, [
            ...currentSelection.ids,
            ...props.rowIds
          ])
          dataView.selection.set(nextIds, {
            anchor: currentSelection.anchor ?? nextIds[0],
            focus: currentSelection.focus ?? nextIds[nextIds.length - 1]
          })
        }

        table.gridSelection.clear()
        table.focus()
      }
    })
  }, [
    allSelected,
    currentSelection,
    dataView.selection,
    props.rowIds,
    table,
    table.gridSelection,
    table.interaction
  ])

  return (
    <TableLeadingRail
      className="bg-inherit"
      selection={(
        <RowSelectionButton
          selected={allSelected}
          indeterminate={someSelected}
          disabled={disabled}
          onPointerStart={onPointerStart}
          label={props.label ?? 'Select rows'}
        />
      )}
    />
  )
}

const same = (
  left: RowScopeSelectionRailProps,
  right: RowScopeSelectionRailProps
) => (
  left.rowIds === right.rowIds
  && left.label === right.label
)

export const RowScopeSelectionRail = memo(View, same)
