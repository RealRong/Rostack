import {
  memo,
  useCallback
} from 'react'
import {
  type SelectionScope,
  type SelectionSummary
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
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
export interface RowScopeSelectionRailProps {
  scope: SelectionScope<ItemId>
  label?: string
}

const View = (props: RowScopeSelectionRailProps) => {
  const table = useTableContext()
  const dataView = useDataView()
  const hitSummary = useStoreSelector(
    dataView.marquee.store,
    session => session
      ? summarizeHitIds(props.scope, session.hitIds)
      : null
  )
  const committedSelection = useKeyedStoreValue(
    dataView.selection.store.scopeSummary,
    props.scope
  )
  const summary = hitSummary ?? committedSelection
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

const summarizeHitIds = (
  scope: SelectionScope<ItemId>,
  hitIds: readonly ItemId[]
): SelectionSummary => {
  if (!hitIds.length || scope.count <= 0) {
    return 'none'
  }

  const hitSet = new Set(hitIds)
  let count = 0
  for (const id of scope.iterate()) {
    if (hitSet.has(id)) {
      count += 1
    }
  }

  if (count <= 0) {
    return 'none'
  }

  return count >= scope.count
    ? 'all'
    : 'some'
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
