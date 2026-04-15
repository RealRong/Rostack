import {
  memo,
  useCallback,
  useMemo
} from 'react'
import {
  createItemListSelectionDomain,
  selectionSnapshot,
  type SelectionScope
} from '@dataview/react/runtime/selection'
import type {
  ItemId
} from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { RowSelectionButton } from '@dataview/react/views/table/components/row/RowRail'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
export interface RowScopeSelectionRailProps {
  scope: SelectionScope<ItemId>
  label?: string
}

const View = (props: RowScopeSelectionRailProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table row scope selection requires an active current view.')
  }

  const selectionDomain = useMemo(
    () => createItemListSelectionDomain(currentView.items),
    [currentView]
  )
  const previewSelection = useStoreSelector(
    table.marqueeSelection,
    selection => selection
      ? selectionSnapshot.summary(selectionDomain, selection, props.scope)
      : null
  )
  const committedSelection = useKeyedStoreValue(
    dataView.selection.store.scopeSummary,
    props.scope
  )
  const summary = previewSelection ?? committedSelection
  const allSelected = summary === 'all'
  const someSelected = summary === 'some'
  const disabled = props.scope.count === 0

  const onPress = useCallback(() => {
    table.selection.rows.command.scope.toggle(props.scope)
    table.focus()
  }, [props.scope, table])

  return (
    <RowSelectionButton
      selected={allSelected}
      indeterminate={someSelected}
      disabled={disabled}
      onPress={onPress}
      label={props.label ?? 'Select rows'}
      showOnHover
    />
  )
}

const same = (
  left: RowScopeSelectionRailProps,
  right: RowScopeSelectionRailProps
) => (
  left.scope.key === right.scope.key
  && left.scope.revision === right.scope.revision
  && left.scope.count === right.scope.count
  && left.label === right.label
)

export const RowScopeSelectionRail = memo(View, same)
