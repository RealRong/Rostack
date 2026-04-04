import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { SquarePen } from 'lucide-react'
import type {
  GroupProperty,
  GroupRecord,
  PropertyId,
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

export interface CardContentProps {
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

export const CardContent = (props: CardContentProps) => {
  const editing = useCardTitleEditing({
    viewId: props.viewId,
    appearanceId: props.appearanceId,
    record: props.record,
    titleProperty: props.titleProperty
  })
  const fieldProperties = useMemo(() => props.properties.filter(
    property => property.id !== props.titleProperty?.id
  ), [props.properties, props.titleProperty?.id])
  const visibleProperties = useMemo(() => (
    editing.mode === 'edit'
      ? fieldProperties
      : fieldProperties.filter(property => !isEmptyPropertyValue(props.record.values[property.id]))
  ), [editing.mode, fieldProperties, props.record])
  const fieldPropertyIds: readonly PropertyId[] = useMemo(() => Array.from(new Set(
    [
      props.titleProperty,
      ...fieldProperties
    ].filter((property): property is GroupProperty => Boolean(property))
      .map(property => property.id)
  )), [fieldProperties, props.titleProperty])

  return (
    <article className={props.slots?.root}>
      {props.showEditAction && !editing.editing ? (
        <Button
          size="icon"
          variant="ghost"
          className={cn('absolute right-2 top-2 z-10', props.slots?.editAction)}
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
      <div className="min-w-0">
        <div className={cn('min-w-0', props.slots?.title?.row)}>
          {props.titleLeading ? props.titleLeading : null}
          <div className={cn('min-w-0', props.slots?.title?.content)}>
            <CardTitle
              editing={editing.mode === 'edit'}
              text={editing.committedTitle}
              draft={editing.titleDraft}
              placeholder={props.titlePlaceholder}
              textClassName={props.slots?.title?.text}
              inputClassName={props.slots?.title?.input}
              onDraftChange={editing.setTitleDraft}
              onCommit={editing.commitTitle}
              onSubmit={editing.submitTitle}
            />
          </div>
        </div>

        {visibleProperties.length ? (
          <div className={props.slots?.property?.list}>
            {visibleProperties.map(property => (
              <div key={property.id} className={props.slots?.property?.item}>
                <CardPropertySlot
                  field={fieldRef({
                    viewId: props.viewId,
                    appearanceId: props.appearanceId,
                    recordId: props.record.id,
                    propertyId: property.id
                  })}
                  property={property}
                  value={props.record.values[property.id]}
                  fieldPropertyIds={fieldPropertyIds}
                  mode={editing.mode}
                  openOnClick
                  density={props.propertyDensity}
                  valueClassName={props.slots?.property?.value}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
