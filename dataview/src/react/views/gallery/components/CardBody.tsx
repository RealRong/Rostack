import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import { CardContent } from '@dataview/react/views/card'
import { cn } from '@dataview/react/ui'
import type { AppearanceId } from '@dataview/react/view'

export const CardBody = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  viewId: ViewId
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  selected?: boolean
  marqueeSelected?: boolean
  dragging?: boolean
  dragCount?: number
}) => {
  return (
    <article
      className={cn(
        'relative rounded-3xl border bg-background p-4 shadow-sm transition-colors',
        props.selected && 'border-primary bg-primary/[0.05]',
        !props.selected && props.marqueeSelected && 'border-primary/40 bg-primary/[0.04]',
        props.dragging && 'shadow-lg'
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
        viewId={props.viewId}
        titleProperty={props.titleProperty}
        properties={props.properties}
        propertyLayout="stack"
        titleEmptyPlaceholder={props.record.id}
        propertyEmptyPlaceholder="—"
      />
    </article>
  )
}
