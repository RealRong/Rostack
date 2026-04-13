import type {
  PointerEvent as ReactPointerEvent
} from 'react'
import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import { RowScopeSelectionRail } from '#react/views/table/components/row/RowScopeSelectionRail.tsx'
import { ColumnHeaderRow } from '#react/views/table/components/column/ColumnHeaderRow.tsx'

export interface ColumnHeaderBlockProps {
  scopeId: string
  rowIds: readonly ItemId[]
  label?: string
  columns: readonly Field[]
  template: string
  resizingPropertyId?: FieldId
  onResizeStart: (
    fieldId: FieldId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
}

export const ColumnHeaderBlock = (props: ColumnHeaderBlockProps) => (
  <div className="relative h-full border-b border-divider bg-transparent text-muted-foreground">
    <RowScopeSelectionRail
      rowIds={props.rowIds}
      label={props.label}
    />
    <ColumnHeaderRow
      scopeId={props.scopeId}
      columns={props.columns}
      template={props.template}
      resizingPropertyId={props.resizingPropertyId}
      onResizeStart={props.onResizeStart}
    />
  </div>
)
