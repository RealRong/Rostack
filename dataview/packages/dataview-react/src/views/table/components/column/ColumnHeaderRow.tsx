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
  Field,
  FieldId
} from '@dataview/core/contracts'
import { columnSortId } from '@dataview/react/views/table/hooks/useColumnReorder'
import { ColumnHeader } from '@dataview/react/views/table/components/column/ColumnHeader'
import { ColumnAddPropertyAction } from '@dataview/react/views/table/components/column/ColumnAddPropertyAction'

export interface ColumnHeaderRowProps {
  scopeId: string
  columns: readonly Field[]
  template: string
  resizingPropertyId?: FieldId
  onResizeStart: (
    fieldId: FieldId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

const View = (props: ColumnHeaderRowProps) => {
  const sortIds = useMemo(
    () => props.columns.map(field => columnSortId(props.scopeId, field.id)),
    [props.columns, props.scopeId]
  )

  return (
    <div className="flex h-full min-w-full w-max items-stretch">
      <SortableContext
        items={sortIds}
        strategy={horizontalListSortingStrategy}
      >
        <div
          className="inline-grid h-full min-w-0 flex-none items-center"
          style={{
            gridTemplateColumns: props.template
          }}
        >
          {props.columns.map((field, index) => (
            <ColumnHeader
              key={field.id}
              field={field}
              sortId={sortIds[index] ?? columnSortId(props.scopeId, field.id)}
              resizeActive={field.id === props.resizingPropertyId}
              onResizeStart={props.onResizeStart}
            />
          ))}
        </div>
      </SortableContext>
      <div className="flex h-full shrink-0 items-stretch">
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
  && left.columns === right.columns
  && left.template === right.template
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

export const ColumnHeaderRow = memo(View, same)
