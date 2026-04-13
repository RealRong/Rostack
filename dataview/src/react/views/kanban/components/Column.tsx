import { resolveOptionColumnStyle } from '@ui/color'
import {
  useDataView
} from '@dataview/react/dataview'
import { cn } from '@ui/utils'
import type { Section } from '@dataview/engine'
import { useKanbanContext } from '../context'
import { ColumnBody } from './ColumnBody'
import { ColumnHeader } from './ColumnHeader'

export const Column = (props: {
  section: Section
}) => {
  const {
    extra,
    runtime
  } = useKanbanContext()
  const engine = useDataView().engine
  const overTarget = runtime.drag.overTarget
  const isColumnTarget = overTarget?.sectionKey === props.section.key
    && !overTarget.beforeItemId
  const sectionColor = extra.groupUsesOptionColors
    ? engine.active.read.section(props.section.key)?.color
    : undefined

  return (
    <section
      data-kanban-column-key={props.section.key}
      className={'flex shrink-0 flex-col w-20'}
      style={{
        width: props.section.collapsed ? undefined : runtime.layout.columnWidth
      }}
    >
      <div
        className={cn(
          'flex flex-col transition-colors',
          'rounded-xl p-2.5 pt-3 gap-3.5',
          isColumnTarget && 'outline outline-2 outline-primary/20 -outline-offset-2'
        )}
        style={extra.fillColumnColor
          ? resolveOptionColumnStyle(sectionColor)
          : undefined}
      >
        <ColumnHeader section={props.section} />
        {props.section.collapsed ? null : <ColumnBody section={props.section} />}
      </div>
    </section>
  )
}
