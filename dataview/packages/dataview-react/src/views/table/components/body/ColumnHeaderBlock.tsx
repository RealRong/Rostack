import type {
  PointerEvent as ReactPointerEvent
} from 'react'
import {
  memo
} from 'react'
import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import { useTableContext } from '@dataview/react/views/table/context'
import { RowScopeSelectionRail } from '@dataview/react/views/table/components/row/RowScopeSelectionRail'
import { ColumnHeaderRow } from '@dataview/react/views/table/components/column/ColumnHeaderRow'

export interface ColumnHeaderBlockProps {
  scopeId: string
  rowIds: readonly ItemId[]
  label?: string
  measureRef?: (node: HTMLDivElement | null) => void
  columns: readonly Field[]
  wrapCells: boolean
  template: string
  resizingPropertyId?: FieldId
  onResizeStart: (
    fieldId: FieldId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
}

const View = (props: ColumnHeaderBlockProps) => {
  const table = useTableContext()

  return (
    <div
      ref={props.measureRef}
      className="relative self-stretch min-w-full w-max border-b border-divider bg-transparent text-muted-foreground"
      style={{
        minHeight: table.layout.headerHeight
      }}
    >
      <RowScopeSelectionRail
        rowIds={props.rowIds}
        label={props.label}
      />
      <ColumnHeaderRow
        scopeId={props.scopeId}
        columns={props.columns}
        wrapCells={props.wrapCells}
        template={props.template}
        resizingPropertyId={props.resizingPropertyId}
        onResizeStart={props.onResizeStart}
      />
    </div>
  )
}

const same = (
  left: ColumnHeaderBlockProps,
  right: ColumnHeaderBlockProps
) => (
  left.scopeId === right.scopeId
  && left.rowIds === right.rowIds
  && left.label === right.label
  && left.measureRef === right.measureRef
  && left.columns === right.columns
  && left.wrapCells === right.wrapCells
  && left.template === right.template
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

export const ColumnHeaderBlock = memo(View, same)
