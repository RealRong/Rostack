import {
  forwardRef,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactNode
} from 'react'
import { SquarePen } from 'lucide-react'
import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  ViewFieldRef
} from '@dataview/react/runtime/currentView'
import { isEmptyPropertyValue } from '@dataview/core/property'
import { Button } from '@ui/button'
import { cn } from '@ui/utils'
import { CardPropertySlot } from './CardPropertySlot'
import { CardTitle } from './CardTitle'
import { useCardTitleEditing } from './useCardTitleEditing'

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

export interface CardContentProps extends Omit<ComponentPropsWithoutRef<'article'>, 'children'> {
  slots?: {
    root?: string
    editAction?: string
    title?: {
      row?: string
      content?: string
      text?: string
      input?: string
    }
    property?: {
      list?: string
      item?: string
      value?: string
    }
  }
  viewId: ViewId
  appearanceId: AppearanceId
  record: GroupRecord
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  titlePlaceholder: string
  showEditAction?: boolean
  titleLeading?: ReactNode
  propertyDensity?: 'default' | 'compact'
}

export const CardContent = forwardRef<HTMLElement, CardContentProps>((props, ref) => {
  const {
    slots,
    viewId,
    appearanceId,
    record,
    titleProperty,
    properties,
    titlePlaceholder,
    showEditAction,
    titleLeading,
    propertyDensity,
    className,
    ...rootProps
  } = props
  const editing = useCardTitleEditing({
    viewId,
    appearanceId,
    record,
    titleProperty
  })
  const fieldProperties = useMemo(() => properties.filter(
    property => property.id !== titleProperty?.id
  ), [properties, titleProperty?.id])
  const visibleProperties = useMemo(() => (
    editing.mode === 'edit'
      ? fieldProperties
      : fieldProperties.filter(property => !isEmptyPropertyValue(record.values[property.id]))
  ), [editing.mode, fieldProperties, record])
  return (
    <article
      {...rootProps}
      ref={ref}
      className={cn(slots?.root, className)}
    >
      {showEditAction && !editing.editing ? (
        <Button
          size="icon"
          variant="ghost"
          className={cn('absolute right-2 top-2.5 z-10', slots?.editAction)}
          aria-label="Edit card"
          title="Edit card"
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            editing.enterEdit()
          }}
        >
          <SquarePen className="size-4" size={15} strokeWidth={1.8} />
        </Button>
      ) : null}
      <div className={cn('min-w-0', slots?.title?.row)}>
        {titleLeading ? titleLeading : null}
        <CardTitle
          editing={editing.mode === 'edit'}
          text={editing.committedTitle}
          draft={editing.titleDraft}
          placeholder={titlePlaceholder}
          rootClassName={slots?.title?.content}
          textClassName={slots?.title?.text}
          inputClassName={slots?.title?.input}
          onDraftChange={editing.setTitleDraft}
          onCommit={editing.commitTitle}
          onSubmit={editing.submitTitle}
        />
      </div>

      {visibleProperties.length ? (
        <div className={slots?.property?.list}>
          {visibleProperties.map(property => (
            <div key={property.id} className={slots?.property?.item}>
              <CardPropertySlot
                field={fieldRef({
                  viewId,
                  appearanceId,
                  recordId: record.id,
                  propertyId: property.id
                })}
                property={property}
                value={record.values[property.id]}
                mode={editing.mode}
                openOnClick
                density={propertyDensity}
                valueClassName={slots?.property?.value}
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
})

CardContent.displayName = 'CardContent'
