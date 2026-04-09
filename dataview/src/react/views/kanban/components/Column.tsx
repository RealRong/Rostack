import { resolveOptionColumnStyle } from '@ui/color'
import { cn } from '@ui/utils'
import type { Section } from '@dataview/engine/project'
import { useKanbanContext } from '../context'
import { ColumnBody } from './ColumnBody'
import { ColumnHeader } from './ColumnHeader'

export const Column = (props: {
  section: Section
}) => {
  const controller = useKanbanContext()
  const overTarget = controller.drag.overTarget
  const isColumnTarget = overTarget?.sectionKey === props.section.key
    && !overTarget.beforeAppearanceId

  return (
    <section
      data-kanban-column-key={props.section.key}
      className={'flex shrink-0 flex-col w-20'}
      style={{
        width: props.section.collapsed ? undefined : controller.layout.columnWidth
      }}
    >
      <div
        className={cn(
          'flex flex-col transition-colors',
          'rounded-xl p-2.5 pt-3 gap-3.5',
          isColumnTarget && 'outline outline-2 outline-primary/20 -outline-offset-2'
        )}
        style={controller.fillColumnColor
          ? resolveOptionColumnStyle(controller.readSectionColorId(props.section.key))
          : undefined}
      >
        <ColumnHeader section={props.section} />
        {props.section.collapsed ? null : <ColumnBody section={props.section} />}
      </div>
    </section>
  )
}
