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
  GroupProperty,
  PropertyId
} from '@dataview/core/contracts'
import { columnSortId } from '../../hooks/useColumnReorder'
import { ColumnHeader } from './ColumnHeader'

export interface ColumnHeaderRowProps {
  scopeId: string
  columns: readonly GroupProperty[]
  template: string
  resizingPropertyId?: PropertyId
  onResizeStart: (
    propertyId: PropertyId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

const View = (props: ColumnHeaderRowProps) => {
  const sortIds = useMemo(
    () => props.columns.map(property => columnSortId(props.scopeId, property.id)),
    [props.columns, props.scopeId]
  )

  return (
    <SortableContext
      items={sortIds}
      strategy={horizontalListSortingStrategy}
    >
      <div
        className="grid h-full min-w-0 flex-1 items-center"
        style={{
          gridTemplateColumns: props.template
        }}
      >
        {props.columns.map((property, index) => (
          <ColumnHeader
            key={property.id}
            property={property}
            sortId={sortIds[index] ?? columnSortId(props.scopeId, property.id)}
            resizeActive={property.id === props.resizingPropertyId}
            onResizeStart={props.onResizeStart}
          />
        ))}
      </div>
    </SortableContext>
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
