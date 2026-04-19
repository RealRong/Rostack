import {
  memo,
  useCallback
} from 'react'
import {
  type SelectionScope
} from '@dataview/runtime/selection'
import type {
  ItemId
} from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  useKeyedStoreValue
} from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { RowSelectionButton } from '@dataview/react/views/table/components/row/RowRail'
export interface RowScopeSelectionRailProps {
  scope: SelectionScope<ItemId>
  label?: string
}

const View = (props: RowScopeSelectionRailProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const previewSummary = useKeyedStoreValue(
    dataView.session.marquee.preview.scopeSummary,
    props.scope
  )
  const committedSelection = useKeyedStoreValue(
    dataView.session.selection.store.scopeSummary,
    props.scope
  )
  const summary = previewSummary ?? committedSelection
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
      fillHeight
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
