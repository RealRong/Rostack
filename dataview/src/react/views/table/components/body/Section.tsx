import {
  memo,
  useCallback,
  useMemo,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { ChevronRight } from 'lucide-react'
import type {
  GroupProperty,
  PropertyId
} from '@dataview/core/contracts'
import { useCurrentView, useEngine } from '@dataview/react/editor'
import { cn } from '@dataview/react/ui'
import { Button } from '@dataview/react/ui/button'
import type {
  AppearanceId,
  Section as TableSection
} from '@dataview/react/view'
import { useTableContext } from '../../context'
import { ColumnHeaderRow } from '../column/ColumnHeaderRow'
import { Row } from '../row/Row'
import { RowScopeSelectionRail } from '../row/RowScopeSelectionRail'

export interface SectionProps {
  section: TableSection
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

const same = (left: SectionProps, right: SectionProps) => (
  left.section === right.section
  && left.columns === right.columns
  && left.template === right.template
  && left.marqueeActive === right.marqueeActive
  && left.dragActive === right.dragActive
  && left.dragIdSet === right.dragIdSet
  && left.onDragStart === right.onDragStart
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

const View = (props: SectionProps) => {
  const editor = useEngine()
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table section requires an active current view.')
  }

  const headerHeight = table.layout.headerHeight
  const rowIds = useMemo(() => props.section.ids, [props.section.ids])

  const onTogglePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }, [])

  const onToggleClick = useCallback(() => {
    editor.view(currentView.view.id).grouping.toggleBucketCollapsed(props.section.key)
    table.focus()
  }, [currentView.view.id, editor, props.section.key, table])

  return (
    <section
      data-table-target="group-row"
      data-group-key={props.section.key}
      className="relative"
    >
      <div
        className="ui-divider-bottom flex items-center"
        style={{
          height: headerHeight
        }}
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
          onPointerDown={onTogglePointerDown}
          onClick={onToggleClick}
        >
          {props.section.title}
        </Button>
      </div>
      {props.section.collapsed ? null : (
        <>
          <div className="ui-divider-bottom relative h-9 bg-transparent text-muted-foreground">
            <RowScopeSelectionRail
              rowIds={rowIds}
              label={`Select rows in ${props.section.title}`}
            />
            <ColumnHeaderRow
              scopeId={props.section.key}
              columns={props.columns}
              template={props.template}
              resizingPropertyId={props.resizingPropertyId}
              onResizeStart={props.onResizeStart}
            />
          </div>
          {props.section.ids.map(rowId => (
            <Row
              key={rowId}
              appearanceId={rowId}
              template={props.template}
              rowHeight={table.layout.rowHeight}
              marqueeActive={props.marqueeActive}
              dragActive={props.dragActive}
              isDragging={props.dragIdSet.has(rowId)}
              onDragStart={props.onDragStart}
            />
          ))}
        </>
      )}
    </section>
  )
}

export const Section = memo(View, same)
