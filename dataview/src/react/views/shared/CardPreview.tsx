import {
  type ComponentPropsWithoutRef,
  type ReactNode
} from 'react'
import type {
  CustomField,
  DataRecord
} from '@dataview/core/contracts'
import { isEmptyFieldValue } from '@dataview/core/field'
import { FieldValueContent } from '@dataview/react/field/value'
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
  record: DataRecord
  fields: readonly CustomField[]
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
    fields,
    titlePlaceholder,
    titleLeading,
    badge,
    propertyDensity,
    showEmptyProperties,
    emptyPlaceholder,
    className,
    ...rootProps
  } = props

  const fieldProperties = fields
  const visibleFields = showEmptyProperties
    ? fieldProperties
    : fieldProperties.filter(property => !isEmptyFieldValue(record.values[property.id]))

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
          visibleFields.length > 0 && slots?.title?.rowWhenProperties
        )}
      >
        {titleLeading ? titleLeading : null}
        <CardTitle
          editing={false}
          text={readCardTitleText(record)}
          placeholder={titlePlaceholder}
          rootClassName={slots?.title?.content}
          textClassName={slots?.title?.text}
        />
      </div>

      {visibleFields.length ? (
        <div className={slots?.property?.list}>
          {visibleFields.map(property => (
            <div key={property.id} className={slots?.property?.item}>
              <FieldValueContent
                field={property}
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
