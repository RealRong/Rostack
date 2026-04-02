import type { GroupRecord } from '@dataview/core/contracts'
import type { AppearanceId } from '@dataview/react/view'
import { CardContent } from '@dataview/react/views/card'
import { cn } from '@ui/utils'
import { useBoardContext } from '../board'

export const CardBody = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  selected?: boolean
  marqueeSelected?: boolean
  dragging?: boolean
  dragCount?: number
  onSelect?: (mode?: 'replace' | 'toggle') => void
}) => {
  const controller = useBoardContext()
  const titleProperty = controller.titleProperty
  const properties = controller.properties

  return (
    <article
      className={cn(
        'ui-surface-content relative rounded-2xl px-4 py-2.5 transition-colors',
        props.selected && 'border-primary bg-primary/[0.05]',
        !props.selected && props.marqueeSelected && 'border-primary/40 bg-primary/[0.04]',
        props.dragging && 'ui-surface-floating'
      )}
    >
      {props.dragging && (props.dragCount ?? 0) > 1 ? (
        <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
          {props.dragCount}
        </span>
      ) : null}
      <CardContent
        appearanceId={props.appearanceId}
        record={props.record}
        viewId={controller.currentView.view.id}
        titleProperty={titleProperty}
        properties={properties}
        propertyLayout="wrap"
        titleEmptyPlaceholder={props.record.id}
        propertyEmptyPlaceholder="—"
        onSelect={() => props.onSelect?.('replace')}
      />
    </article>
  )
}
