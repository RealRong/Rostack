import type { SectionId } from '@dataview/engine'
import { FieldValueContent } from '@dataview/react/field/value'
import { useTranslation } from '@shared/i18n/react'
import { cn } from '@shared/ui/utils'
import { useKanbanRuntimeContext } from '@dataview/react/views/kanban/KanbanView'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'

export const ColumnHeader = (props: {
  sectionId: SectionId
}) => {
  const { t } = useTranslation()
  const runtime = useKanbanRuntimeContext()
  const board = useStoreValue(runtime.board)
  const section = useKeyedStoreValue(runtime.section, props.sectionId)
  if (!section) {
    return null
  }
  const groupField = board.groupField
  const bucket = section.bucket
  const canRenderBucketValue = Boolean(
    board.groupUsesOptionColors
    && groupField
    && bucket
  )
  const count = section.count

  return (
    <div className="flex items-center gap-3">

      {canRenderBucketValue ? (
        <FieldValueContent
          field={groupField}
          value={bucket?.value}
          emptyPlaceholder={bucket
            ? t(bucket.label)
            : t(section.label)}
          className={cn(
            'max-w-full',
            !board.groupUsesOptionColors && 'text-sm font-semibold text-foreground'
          )}
        />
      ) : (
        <h3 className="truncate text-sm font-semibold text-foreground">
          {t(section.label)}
        </h3>
      )}

      {section.collapsed ? (
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
