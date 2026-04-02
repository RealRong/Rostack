import type { ReactNode } from 'react'
import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  ViewFieldRef
} from '@dataview/react/currentView'
import { CardField } from './Field'

export interface CardContentProps {
  appearanceId: AppearanceId
  record: GroupRecord
  viewId: ViewId
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  propertyLayout?: 'stack' | 'wrap'
  titleEmptyPlaceholder?: ReactNode
  propertyEmptyPlaceholder?: ReactNode
  onSelect?: () => void
}

const fieldRef = (input: {
  viewId: ViewId
  appearanceId: AppearanceId
  recordId: string
  propertyId: string
}): ViewFieldRef => ({
  viewId: input.viewId,
  appearanceId: input.appearanceId,
  recordId: input.recordId,
  propertyId: input.propertyId
})

export const CardContent = (props: CardContentProps) => {
  const fieldPropertyIds = Array.from(new Set(
    [
      props.titleProperty,
      ...props.properties
    ].filter((property): property is GroupProperty => Boolean(property))
      .map(property => property.id)
  ))
  const wrap = props.propertyLayout === 'wrap'

  return (
    <div className="min-w-0">
      <div className="min-w-0 pb-2 text-base font-semibold leading-6 text-foreground">
        <CardField
          field={fieldRef({
            viewId: props.viewId,
            appearanceId: props.appearanceId,
            recordId: props.record.id,
            propertyId: props.titleProperty?.id ?? 'title'
          })}
          property={props.titleProperty}
          value={props.titleProperty
            ? props.record.values[props.titleProperty.id]
            : undefined}
          fieldPropertyIds={fieldPropertyIds}
          emptyPlaceholder={props.titleEmptyPlaceholder ?? props.record.id}
          onSelect={props.onSelect}
        />
      </div>

      {props.properties.length ? (
        <div
          className={wrap
            ? 'mx-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pt-0 leading-6'
            : 'mx-0 flex flex-col pb-2 pt-0 leading-6'}
        >
          {props.properties.map(property => (
            <div
              key={property.id}
              className={wrap
                ? 'inline-flex min-w-0 max-w-full'
                : 'min-w-0 pb-2 last:pb-0'}
            >
              <CardField
                field={fieldRef({
                  viewId: props.viewId,
                  appearanceId: props.appearanceId,
                  recordId: props.record.id,
                  propertyId: property.id
                })}
                property={property}
                value={props.record.values[property.id]}
                fieldPropertyIds={fieldPropertyIds}
                emptyPlaceholder={props.propertyEmptyPlaceholder ?? '—'}
                onSelect={props.onSelect}
                className="text-[13px] leading-6 text-foreground"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
