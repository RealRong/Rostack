import { resolveOptionDotStyle } from '@ui/color'
import type { Section } from '@dataview/react/runtime/currentView'
import { useKanbanContext } from '../context'

export const ColumnHeader = (props: {
  section: Section
}) => {
  const controller = useKanbanContext()

  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {controller.groupUsesOptionColors ? (
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full"
              style={resolveOptionDotStyle(
                controller.readSectionColorId(props.section.key)
              )}
            />
          ) : null}
          <h3 className="truncate text-sm font-semibold text-foreground">
            {props.section.title}
            <span className="ml-2 text-xs font-semibold text-muted-foreground">{props.section.ids.length}</span>
          </h3>
        </div>
      </div>
      {props.section.collapsed ? (
        <div className="rounded-full bg-surface-subtle px-2 py-1 text-[11px] font-medium text-fg">
          {props.section.ids.length}
        </div>
      ) : null}
    </header>
  )
}
