import type {
  GroupProperty,
  GroupRecord,
} from '@dataview/core/contracts'
import {
  CardTitle
} from '@dataview/react/views/shared'
import {
  PropertyValueContent
} from '@dataview/react/properties/value'
import { cn } from '@ui/utils'
import { useBoardContext } from '../board'
import {
  readCardTitleText
} from '@dataview/react/views/shared/cardTitleValue'

export const CardSurface = (props: {
  record: GroupRecord
  dragging?: boolean
  dragCount?: number
}) => {
  const controller = useBoardContext()
  const titleProperty = controller.titleProperty
  const properties = controller.properties

  return (
    <article
      className={cn(
        'ui-surface-content relative rounded-2xl px-4 py-2.5 transition-colors',
        props.dragging && 'ui-surface-floating'
      )}
    >
      {props.dragging && (props.dragCount ?? 0) > 1 ? (
        <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
          {props.dragCount}
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="min-w-0 pb-2">
          <CardTitle
            editing={false}
            text={readCardTitleText(titleProperty, props.record)}
            placeholder={props.record.id}
            textClassName="text-[15px] font-semibold leading-5"
          />
        </div>

        {properties.length ? (
          <div className="mx-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pt-0 leading-5">
            {properties.map(property => (
              <div key={property.id} className="inline-flex min-w-0 max-w-full">
                <PropertyValueContent
                  property={property}
                  value={props.record.values[property.id]}
                  className="text-xs leading-5 text-foreground"
                  emptyPlaceholder="—"
                  density="compact"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
