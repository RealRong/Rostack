import type { Section } from '@dataview/engine/projection/view'
import { FieldValueContent } from '@dataview/react/field/value'
import { cn } from '@ui/utils'
import { useKanbanContext } from '../context'

export const ColumnHeader = (props: {
  section: Section
}) => {
  const controller = useKanbanContext()
  const groupField = controller.groupField
  const bucket = props.section.bucket
  const canRenderBucket = Boolean(groupField && bucket)
  const count = props.section.ids.length

  return (
    <div className="flex items-center gap-3">

      {canRenderBucket ? (
        <FieldValueContent
          field={groupField}
          value={bucket?.value}
          emptyPlaceholder={bucket?.title ?? props.section.title}
          className={cn(
            'max-w-full',
            !controller.groupUsesOptionColors && 'text-sm font-semibold text-foreground'
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
