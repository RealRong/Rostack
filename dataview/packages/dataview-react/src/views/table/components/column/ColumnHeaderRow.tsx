import {
  memo,
  useMemo,
  type PointerEvent
} from 'react'
import {
  SortableContext,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable'
import type {
  ItemId
} from '@dataview/engine'
import type {
  SelectionScope
} from '@dataview/react/runtime/selection'
import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import { columnSortId } from '@dataview/react/views/table/hooks/useColumnReorder'
import { ColumnHeader } from '@dataview/react/views/table/components/column/ColumnHeader'
import { ColumnAddPropertyAction } from '@dataview/react/views/table/components/column/ColumnAddPropertyAction'
import { RowScopeSelectionRail } from '@dataview/react/views/table/components/row/RowScopeSelectionRail'

export interface ColumnHeaderRowProps {
  scopeId: string
  scope: SelectionScope<ItemId>
  label?: string
  columns: readonly Field[]
  showVerticalLines: boolean
  wrap: boolean
  template: string
  resizingPropertyId?: FieldId
  onResizeStart: (
    fieldId: FieldId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

interface ColumnHeaderFieldsProps {
  scopeId: string
  columns: readonly Field[]
  showVerticalLines: boolean
  wrap: boolean
  template: string
  resizingPropertyId?: FieldId
  onResizeStart: (
    fieldId: FieldId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

const ColumnHeaderFieldsView = (props: ColumnHeaderFieldsProps) => {
  const sortIds = useMemo(
    () => props.columns.map(field => columnSortId(props.scopeId, field.id)),
    [props.columns, props.scopeId]
  )

  return (
    <SortableContext
      items={sortIds}
      strategy={horizontalListSortingStrategy}
    >
      <div
        className="inline-grid h-full min-w-0 flex-none items-stretch"
        style={{
          gridTemplateColumns: props.template
        }}
      >
        {props.columns.map((field, index) => (
          <ColumnHeader
            key={field.id}
            field={field}
            sortId={sortIds[index] ?? columnSortId(props.scopeId, field.id)}
            showVerticalLines={props.showVerticalLines}
            wrap={props.wrap}
            resizeActive={field.id === props.resizingPropertyId}
            onResizeStart={props.onResizeStart}
          />
        ))}
      </div>
    </SortableContext>
  )
}

const sameHeaderFields = (
  left: ColumnHeaderFieldsProps,
  right: ColumnHeaderFieldsProps
) => (
  left.scopeId === right.scopeId
  && left.columns === right.columns
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.template === right.template
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

const ColumnHeaderFields = memo(ColumnHeaderFieldsView, sameHeaderFields)

const View = (props: ColumnHeaderRowProps) => {
  return (
    <div
      className="flex h-full min-w-full w-max items-stretch"
    >
      <RowScopeSelectionRail
        scope={props.scope}
        label={props.label}
      />
      <ColumnHeaderFields
        scopeId={props.scopeId}
        columns={props.columns}
        showVerticalLines={props.showVerticalLines}
        wrap={props.wrap}
        template={props.template}
        resizingPropertyId={props.resizingPropertyId}
        onResizeStart={props.onResizeStart}
      />
      <div
        className="flex h-full shrink-0 items-stretch"
      >
        <ColumnAddPropertyAction />
      </div>
    </div>
  )
}

const same = (
  left: ColumnHeaderRowProps,
  right: ColumnHeaderRowProps
) => (
  left.scopeId === right.scopeId
  && left.scope.key === right.scope.key
  && left.scope.revision === right.scope.revision
  && left.scope.count === right.scope.count
  && left.label === right.label
  && left.columns === right.columns
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.template === right.template
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

export const ColumnHeaderRow = memo(View, same)
