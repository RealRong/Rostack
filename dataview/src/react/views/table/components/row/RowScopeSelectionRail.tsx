import {
  memo,
  useCallback,
  type PointerEvent
} from 'react'
import {
  selection
} from '@dataview/react/selection'
import type {
  AppearanceId
} from '@dataview/react/currentView'
import {
  useCurrentView,
  useDataView,
  useSelection
} from '@dataview/react/dataview'
import { useTableContext } from '../../context'
import { RowSelectionButton, TableLeadingRail } from './RowRail'

export interface RowScopeSelectionRailProps {
  rowIds: readonly AppearanceId[]
  label?: string
}

const View = (props: RowScopeSelectionRailProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table row scope selection requires an active current view.')
  }

  const currentSelection = useSelection()
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

  const onPointerStart = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    table.interaction.start({
      mode: 'pointer',
      gesture: 'row-select',
      event,
      up: () => {
        if (allSelected) {
          const scopeSet = new Set(props.rowIds)
          const nextIds = currentSelection.ids.filter(rowId => !scopeSet.has(rowId))
          dataView.selection.set(nextIds, {
            anchor: currentSelection.anchor,
            focus: currentSelection.focus
          })
        } else {
          const nextIds = selection.normalize(currentView.appearances.ids, [
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
          label={props.label ?? 'Select rows'}
          onPointerStart={onPointerStart}
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
