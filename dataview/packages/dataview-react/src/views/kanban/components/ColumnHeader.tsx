import type { Section } from '@dataview/engine'
import { FieldValueContent } from '#react/field/value'
import { cn } from '@shared/ui/utils'
import { useKanbanContext } from '#react/views/kanban/context'

export const ColumnHeader = (props: {
  section: Section
}) => {
  const {
    active,
    extra
  } = useKanbanContext()
  const groupField = active.query.group.field
  const bucket = props.section.bucket
  const canRenderBucket = Boolean(groupField && bucket)
  const count = props.section.itemIds.length

  return (
    <div className="flex items-center gap-3">

      {canRenderBucket ? (
        <FieldValueContent
          field={groupField}
          value={bucket?.value}
          emptyPlaceholder={bucket?.title ?? props.section.title}
          className={cn(
            'max-w-full',
            !extra.groupUsesOptionColors && 'text-sm font-semibold text-foreground'
          )}
        />
      ) : (
        <h3 className="truncate text-sm font-semibold text-foreground">
          {props.section.title}
        </h3>
      )}

      {props.section.collapsed ? (
        <div className="rounded-full bg-surface-subtle px-2 py-1 text-sm font-medium text-fg">
          {count}
        </div>
      ) : (
        <div className="shrink-0 leading-none text-sm font-medium text-muted-foreground">
          {count}
        </div>
      )}
    </div>
  )
}
