import {
  type ComponentPropsWithoutRef,
  type ReactNode
} from 'react'
import type {
  GroupProperty,
  GroupRecord
} from '@dataview/core/contracts'
import { isEmptyPropertyValue } from '@dataview/core/property'
import { PropertyValueContent } from '@dataview/react/properties/value'
import { cn } from '@ui/utils'
import { CardTitle } from './CardTitle'
import { readCardTitleText } from './cardTitleValue'

export interface CardPreviewProps extends Omit<ComponentPropsWithoutRef<'article'>, 'children'> {
  slots?: {
    root?: string
    title?: {
      row?: string
      rowWhenProperties?: string
      content?: string
      text?: string
    }
    property?: {
      list?: string
      item?: string
      value?: string
    }
  }
  record: GroupRecord
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  titlePlaceholder: string
  titleLeading?: ReactNode
  badge?: ReactNode
  propertyDensity?: 'default' | 'compact'
  showEmptyProperties?: boolean
  emptyPlaceholder?: string
}

export const CardPreview = (props: CardPreviewProps) => {
  const {
    slots,
    record,
    titleProperty,
    properties,
    titlePlaceholder,
    titleLeading,
    badge,
    propertyDensity,
    showEmptyProperties,
    emptyPlaceholder,
    className,
    ...rootProps
  } = props

  const fieldProperties = properties.filter(property => property.id !== titleProperty?.id)
  const visibleProperties = showEmptyProperties
    ? fieldProperties
    : fieldProperties.filter(property => !isEmptyPropertyValue(record.values[property.id]))

  return (
    <article
      {...rootProps}
      className={cn(slots?.root, className)}
    >
      {badge ? badge : null}
      <div
        className={cn(
          'min-w-0',
          slots?.title?.row,
          visibleProperties.length > 0 && slots?.title?.rowWhenProperties
        )}
      >
        {titleLeading ? titleLeading : null}
        <CardTitle
          editing={false}
          text={readCardTitleText(titleProperty, record)}
          placeholder={titlePlaceholder}
          rootClassName={slots?.title?.content}
          textClassName={slots?.title?.text}
        />
      </div>

      {visibleProperties.length ? (
        <div className={slots?.property?.list}>
          {visibleProperties.map(property => (
            <div key={property.id} className={slots?.property?.item}>
              <PropertyValueContent
                property={property}
                value={record.values[property.id]}
                className={slots?.property?.value}
                emptyPlaceholder={emptyPlaceholder}
                density={propertyDensity}
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
