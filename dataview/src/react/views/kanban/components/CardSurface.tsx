import type {
  GroupProperty,
  GroupRecord,
  PropertyId
} from '@dataview/core/contracts'
import type { AppearanceId } from '@dataview/react/currentView'
import type {
  ViewFieldRef
} from '@dataview/engine/projection/view'
import { CardField } from '@dataview/react/views/shared'
import { cn } from '@ui/utils'
import { useBoardContext } from '../board'

const fieldRef = (input: {
  viewId: string
  appearanceId: AppearanceId
  recordId: string
  propertyId: string
}): ViewFieldRef => ({
  viewId: input.viewId,
  appearanceId: input.appearanceId,
  recordId: input.recordId,
  propertyId: input.propertyId
})

export const CardSurface = (props: {
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
  const fieldPropertyIds: readonly PropertyId[] = Array.from(new Set(
    [
      titleProperty,
      ...properties
    ].filter((property): property is GroupProperty => Boolean(property))
      .map(property => property.id)
  ))

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
      <div className="min-w-0">
        <div className="min-w-0 pb-2 text-[15px] font-semibold leading-5 text-foreground">
          <CardField
            field={fieldRef({
              viewId: controller.currentView.view.id,
              appearanceId: props.appearanceId,
              recordId: props.record.id,
              propertyId: titleProperty?.id ?? 'title'
            })}
            property={titleProperty}
            value={titleProperty
              ? props.record.values[titleProperty.id]
              : undefined}
            fieldPropertyIds={fieldPropertyIds}
            emptyPlaceholder={props.record.id}
            onSelect={() => props.onSelect?.('replace')}
            valueClassName="text-[15px] font-semibold leading-5 text-foreground"
          />
        </div>

        {properties.length ? (
          <div className="mx-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pt-0 leading-5">
            {properties.map(property => (
              <div key={property.id} className="inline-flex min-w-0 max-w-full">
                <CardField
                  field={fieldRef({
                    viewId: controller.currentView.view.id,
                    appearanceId: props.appearanceId,
                    recordId: props.record.id,
                    propertyId: property.id
                  })}
                  property={property}
                  value={props.record.values[property.id]}
                  fieldPropertyIds={fieldPropertyIds}
                  emptyPlaceholder="—"
                  onSelect={() => props.onSelect?.('replace')}
                  density="compact"
                  valueClassName="text-xs leading-5 text-foreground"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
