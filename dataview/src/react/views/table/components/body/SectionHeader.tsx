import {
  ChevronRight
} from 'lucide-react'
import {
  useDataView
} from '#react/dataview'
import type {
  Section
} from '@dataview/engine'
import { useStoreValue } from '@shared/react'
import { useTableContext } from '../../context'
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
          engine.active.sections.toggleCollapse(props.section.key)
          table.focus()
        }}
      >
        {props.section.title}
      </Button>
    </div>
  )
}
