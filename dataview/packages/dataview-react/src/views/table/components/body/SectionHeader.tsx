import {
  memo
} from 'react'
import {
  ChevronRight
} from 'lucide-react'
import {
  useDataView
} from '@dataview/react/dataview'
import type { SectionKey } from '@dataview/engine'
import {
  useStoreValue
} from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'
import { Button } from '@shared/ui/button'
import { cn } from '@shared/ui/utils'
import { useTranslation } from '@shared/i18n/react'

export interface SectionHeaderProps {
  sectionKey: SectionKey
  measureRef?: (node: HTMLDivElement | null) => void
}

const View = (props: SectionHeaderProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const table = useTableContext()
  const grid = useStoreValue(dataView.table.grid)
  const section = grid?.sections.get(props.sectionKey)
  if (!section) {
    throw new Error('Table section header requires an active table section.')
  }

  return (
    <div
      ref={props.measureRef}
      data-table-target="group-row"
      data-group-key={props.sectionKey}
      className="flex self-stretch min-w-full w-max items-center"
      style={{
        minHeight: table.layout.headerHeight
      }}
    >
      <div className="min-w-0 flex-1">
        <Button
          variant="plain"
          layout="row"
          leading={(
            <ChevronRight
              className={cn(
                'size-4 transition-transform',
                !section.collapsed && 'rotate-90'
              )}
              size={16}
              strokeWidth={1.8}
            />
          )}
          aria-expanded={!section.collapsed}
          onPointerDown={event => {
            event.stopPropagation()
          }}
          onClick={() => {
            dataView.engine.active.sections.toggleCollapse(section.key)
            table.focus()
          }}
        >
          {t(section.label)}
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

const same = (
  left: SectionHeaderProps,
  right: SectionHeaderProps
) => left.sectionKey === right.sectionKey
  && left.measureRef === right.measureRef

export const SectionHeader = memo(View, same)
