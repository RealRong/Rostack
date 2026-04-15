import {
  ChevronRight
} from 'lucide-react'
import {
  useDataView
} from '@dataview/react/dataview'
import type {
  Section
} from '@dataview/engine'
import { useStoreValue } from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'
import { Button } from '@shared/ui/button'
import { cn } from '@shared/ui/utils'

export interface SectionHeaderProps {
  section: Section
}

export const SectionHeader = (props: SectionHeaderProps) => {
  const { engine } = useDataView()
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table section header requires an active current view.')
  }

  return (
    <div
      data-table-target="group-row"
      data-group-key={props.section.key}
      className="flex h-full min-w-full w-max items-center"
    >
      <div className="min-w-0 flex-1">
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
            engine.active.sections.toggleCollapse(props.section.key)
            table.focus()
          }}
        >
          {props.section.title}
        </Button>
      </div>
      <div
        className="shrink-0"
        aria-hidden="true"
        style={{
          width: TABLE_TRAILING_ACTION_WIDTH
        }}
      />
    </div>
  )
}
