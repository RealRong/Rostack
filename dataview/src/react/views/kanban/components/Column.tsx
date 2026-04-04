import type { Section } from '@dataview/react/runtime/currentView'
import { useKanbanContext } from '../context'
import { ColumnBody } from './ColumnBody'
import { ColumnHeader } from './ColumnHeader'

export const Column = (props: {
  section: Section
}) => {
  const controller = useKanbanContext()

  return (
    <section
      data-kanban-column-key={props.section.key}
      className={'flex shrink-0 flex-col gap-3 w-20'}
      style={{
        width: props.section.collapsed ? undefined : controller.layout.columnWidth
      }}
    >
      <ColumnHeader section={props.section} />
      {props.section.collapsed ? null : <ColumnBody section={props.section} />}
    </section>
  )
}
