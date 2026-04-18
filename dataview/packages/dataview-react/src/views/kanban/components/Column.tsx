import { resolveOptionColumnStyle } from '@shared/ui/color'
import { cn } from '@shared/ui/utils'
import type { SectionKey } from '@dataview/engine'
import { useKanbanRuntimeContext } from '@dataview/react/views/kanban/KanbanView'
import { ColumnBody } from '@dataview/react/views/kanban/components/ColumnBody'
import { ColumnHeader } from '@dataview/react/views/kanban/components/ColumnHeader'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'

export const Column = (props: {
  sectionKey: SectionKey
}) => {
  const runtime = useKanbanRuntimeContext()
  const board = useStoreValue(runtime.board)
  const section = useKeyedStoreValue(runtime.section, props.sectionKey)
  if (!section) {
    return null
  }
  const overTarget = runtime.drag.overTarget
  const isColumnTarget = overTarget?.sectionKey === section.key
    && !overTarget.beforeItemId
  const sectionColor = board.groupUsesOptionColors
    ? section.color
    : undefined

  return (
    <section
      data-kanban-column-key={section.key}
      className={'flex shrink-0 flex-col w-20'}
      style={{
        width: section.collapsed ? undefined : runtime.layout.columnWidth
      }}
    >
      <div
        className={cn(
          'flex flex-col transition-colors',
          'rounded-xl p-2.5 pt-3 gap-3.5',
          isColumnTarget && 'outline outline-2 outline-primary/20 -outline-offset-2'
        )}
        style={board.fillColumnColor
          ? resolveOptionColumnStyle(sectionColor)
          : undefined}
      >
        <ColumnHeader sectionKey={section.key} />
        {section.collapsed ? null : <ColumnBody sectionKey={section.key} />}
      </div>
    </section>
  )
}
