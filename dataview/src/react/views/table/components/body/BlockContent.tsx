import type {
  PointerEvent as ReactPointerEvent
} from 'react'
import {
  ChevronRight
} from 'lucide-react'
import type {
  GroupProperty,
  PropertyId
} from '@dataview/core/contracts'
import {
  useCurrentView,
  useDataView
} from '@dataview/react/dataview'
import type {
  AppearanceId,
  Section
} from '@dataview/react/runtime/currentView'
import {
  useTableBlocks
} from '../../virtual'
import { useTableContext } from '../../context'
import { Row } from '../row/Row'
import { RowScopeSelectionRail } from '../row/RowScopeSelectionRail'
import { ColumnHeaderRow } from '../column/ColumnHeaderRow'
import { Button } from '@ui/button'
import { cn } from '@ui/utils'

const SectionHeader = (props: {
  section: Section
}) => {
  const { engine } = useDataView()
  const currentView = useCurrentView()
  const table = useTableContext()
  if (!currentView) {
    throw new Error('Table section header requires an active current view.')
  }

  return (
    <div
      data-table-target="group-row"
      data-group-key={props.section.key}
      className="flex h-full items-center border-b border-divider"
    >
      <Button
        variant="plain"
        layout="row"
        leading={(
          <ChevronRight
            className={cn(
              'size-4 transition-transform',
              !props.section.collapsed && 'rotate-90'
            )}
            size={16}
            strokeWidth={1.8}
          />
        )}
        aria-expanded={!props.section.collapsed}
        onPointerDown={event => {
          event.stopPropagation()
        }}
        onClick={() => {
          engine.view(currentView.view.id).grouping.toggleBucketCollapsed(props.section.key)
          table.focus()
        }}
      >
        {props.section.title}
      </Button>
    </div>
  )
}

const ColumnHeaderBlock = (props: {
  scopeId: string
  rowIds: readonly AppearanceId[]
  label?: string
  columns: readonly GroupProperty[]
  template: string
  resizingPropertyId?: PropertyId
  onResizeStart: (
    propertyId: PropertyId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
}) => (
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

export interface BlockContentProps {
  grouped: boolean
  rowIds: readonly AppearanceId[]
  sections: readonly Section[]
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

export const BlockContent = (props: BlockContentProps) => {
  const table = useTableContext()
  const virtual = useTableBlocks({
    grouped: props.grouped,
    rowIds: props.rowIds,
    sections: props.sections
  })
  const lastBlock = virtual.items[virtual.items.length - 1]
  const bottomSpacerHeight = lastBlock
    ? Math.max(0, virtual.totalHeight - lastBlock.top - lastBlock.height)
    : 0

  return (
    <div>
      {virtual.items.map((block, index) => {
        const previous = virtual.items[index - 1]
        const marginTop = index === 0
          ? block.top
          : Math.max(0, block.top - previous!.top - previous!.height)

        switch (block.kind) {
          case 'section-header':
            return (
              <div
                key={block.key}
                style={{
                  height: block.height,
                  marginTop
                }}
              >
                <SectionHeader section={block.section} />
              </div>
            )
          case 'column-header':
            return (
              <div
                key={block.key}
                style={{
                  height: block.height,
                  marginTop
                }}
              >
                <ColumnHeaderBlock
                  scopeId={block.scopeId}
                  rowIds={block.rowIds}
                  label={block.label}
                  columns={props.columns}
                  template={props.template}
                  resizingPropertyId={props.resizingPropertyId}
                  onResizeStart={props.onResizeStart}
                />
              </div>
            )
          case 'row':
            return (
              <div
                key={block.key}
                style={{
                  height: block.height,
                  marginTop
                }}
              >
                <Row
                  appearanceId={block.rowId}
                  template={props.template}
                  rowHeight={table.layout.rowHeight}
                  marqueeActive={props.marqueeActive}
                  dragActive={props.dragActive}
                  isDragging={props.dragIdSet.has(block.rowId)}
                  onDragStart={props.onDragStart}
                />
              </div>
            )
        }
      })}
      {bottomSpacerHeight ? (
        <div
          aria-hidden="true"
          style={{
            height: bottomSpacerHeight
          }}
        />
      ) : null}
    </div>
  )
}
