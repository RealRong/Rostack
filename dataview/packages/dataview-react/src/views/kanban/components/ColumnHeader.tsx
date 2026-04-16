import type { Section } from '@dataview/engine'
import { FieldValueContent } from '@dataview/react/field/value'
import { useTranslation } from '@shared/i18n/react'
import { cn } from '@shared/ui/utils'
import { useKanbanContext } from '@dataview/react/views/kanban/context'

export const ColumnHeader = (props: {
  section: Section
}) => {
  const { t } = useTranslation()
  const {
    active,
    extra
  } = useKanbanContext()
  const groupField = active.query.group.field
  const bucket = props.section.bucket
  const canRenderBucketValue = Boolean(
    extra.groupUsesOptionColors
    && groupField
    && bucket
  )
  const count = props.section.items.count

  return (
    <div className="flex items-center gap-3">

      {canRenderBucketValue ? (
        <FieldValueContent
          field={groupField}
          value={bucket?.value}
          emptyPlaceholder={bucket
            ? t(bucket.label)
            : t(props.section.label)}
          className={cn(
            'max-w-full',
            !extra.groupUsesOptionColors && 'text-sm font-semibold text-foreground'
          )}
        />
      ) : (
        <h3 className="truncate text-sm font-semibold text-foreground">
          {t(props.section.label)}
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
