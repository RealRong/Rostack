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
import type {
  SelectionScope
} from '@dataview/react/runtime/selection'
import { useTableContext } from '@dataview/react/views/table/context'
import { ColumnHeaderRow } from '@dataview/react/views/table/components/column/ColumnHeaderRow'

export interface ColumnHeaderBlockProps {
  scopeId: string
  scope: SelectionScope<ItemId>
  label?: string
  measureRef?: (node: HTMLDivElement | null) => void
  columns: readonly Field[]
  showVerticalLines: boolean
  wrap: boolean
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
        height: table.layout.headerHeight
      }}
    >
      <ColumnHeaderRow
        scopeId={props.scopeId}
        scope={props.scope}
        label={props.label}
        columns={props.columns}
        showVerticalLines={props.showVerticalLines}
        wrap={props.wrap}
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
  && left.scope.key === right.scope.key
  && left.scope.revision === right.scope.revision
  && left.scope.count === right.scope.count
  && left.label === right.label
  && left.measureRef === right.measureRef
  && left.columns === right.columns
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.template === right.template
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

export const ColumnHeaderBlock = memo(View, same)
