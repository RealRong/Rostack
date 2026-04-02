import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  GroupProperty,
  PropertyId
} from '@/core/contracts'
import type { AppearanceId } from '@/react/view'
import { useTableContext } from '../../context'
import {
  useVirtualRows,
  type VirtualRow
} from '../../hooks/useVirtualRows'
import { ColumnHeaderRow } from '../column/ColumnHeaderRow'
import { Row } from '../row/Row'
import { RowScopeSelectionRail } from '../row/RowScopeSelectionRail'

interface RowsProps {
  items: readonly VirtualRow[]
  totalHeight: number
  rowHeight: number
  template: string
  marqueeActive: boolean
  dragActive: boolean
  dragIdSet: ReadonlySet<AppearanceId>
  onDragStart: (input: {
    rowId: AppearanceId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
}

const sameRows = (left: RowsProps, right: RowsProps) => (
  left.items === right.items
  && left.totalHeight === right.totalHeight
  && left.rowHeight === right.rowHeight
  && left.template === right.template
  && left.marqueeActive === right.marqueeActive
  && left.dragActive === right.dragActive
  && left.dragIdSet === right.dragIdSet
  && left.onDragStart === right.onDragStart
)

const Rows = memo((props: RowsProps) => (
  <div
    style={{
      position: 'relative',
      height: props.totalHeight
    }}
  >
    {props.items.map(item => {
      const style: CSSProperties = {
        position: 'absolute',
        top: item.top,
        left: 0,
        right: 0,
        height: props.rowHeight
      }

      return (
        <div
          key={item.rowId}
          style={style}
        >
          <Row
            appearanceId={item.rowId}
            template={props.template}
            rowHeight={props.rowHeight}
            marqueeActive={props.marqueeActive}
            dragActive={props.dragActive}
            isDragging={props.dragIdSet.has(item.rowId)}
            onDragStart={props.onDragStart}
          />
        </div>
      )
    })}
  </div>
), sameRows)

export interface FlatContentProps {
  rowIds: readonly AppearanceId[]
  columns: readonly GroupProperty[]
  template: string
  marqueeActive: boolean
  dragActive: boolean
  dragIdSet: ReadonlySet<AppearanceId>
  onDragStart: (input: {
    rowId: AppearanceId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
  resizingPropertyId?: PropertyId
  onResizeStart: (
    propertyId: PropertyId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
}

export const FlatContent = (props: FlatContentProps) => {
  const table = useTableContext()
  const virtualRows = useVirtualRows(props.rowIds)
  const rowHeight = table.layout.rowHeight

  return (
    <>
      <div className="ui-divider-bottom relative h-9 bg-transparent text-muted-foreground">
        <RowScopeSelectionRail rowIds={props.rowIds} />
        <ColumnHeaderRow
          scopeId="flat"
          columns={props.columns}
          template={props.template}
          resizingPropertyId={props.resizingPropertyId}
          onResizeStart={props.onResizeStart}
        />
      </div>
      <Rows
        items={virtualRows.items}
        totalHeight={virtualRows.totalHeight}
        rowHeight={rowHeight}
        template={props.template}
        marqueeActive={props.marqueeActive}
        dragActive={props.dragActive}
        dragIdSet={props.dragIdSet}
        onDragStart={props.onDragStart}
      />
    </>
  )
}
