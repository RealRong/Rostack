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
import { Button } from '@ui/button'
import { cn } from '@ui/utils'
import { CardPropertySlot } from './CardPropertySlot'
import { CardTitle } from './CardTitle'

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
  mode: 'view' | 'edit'
  committedTitle: string
  titleDraft: string
  titlePlaceholder: string
  onTitleDraftChange: (value: string) => void
  onCommitTitle: () => void
  onSubmitTitle: () => void
  onSelect: () => void
  showEditAction?: boolean
  onEnterEdit?: () => void
  titleLeading?: ReactNode
  propertyDensity?: 'default' | 'compact'
}

export const CardContent = (props: CardContentProps) => {
  const fieldPropertyIds: readonly PropertyId[] = useMemo(() => Array.from(new Set(
    [
      props.titleProperty,
      ...props.properties
    ].filter((property): property is GroupProperty => Boolean(property))
      .map(property => property.id)
  )), [props.properties, props.titleProperty])

  return (
    <article className={props.slots?.root}>
      {props.showEditAction ? (
        <Button
          size="icon"
          variant="ghost"
          className={cn('absolute right-2 top-2 z-10', props.slots?.editAction)}
          aria-label="Edit card"
          title="Edit card"
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            props.onEnterEdit?.()
          }}
        >
          <SquarePen className="size-4" size={15} strokeWidth={1.8} />
        </Button>
      ) : null}
      <div className="min-w-0">
        <div className={cn('min-w-0 pb-2', props.slots?.title?.row)}>
          {props.titleLeading ? props.titleLeading : null}
          <div className={cn('min-w-0', props.slots?.title?.content)}>
            <CardTitle
              editing={props.mode === 'edit'}
              text={props.committedTitle}
              draft={props.titleDraft}
              placeholder={props.titlePlaceholder}
              textClassName={props.slots?.title?.text}
              inputClassName={props.slots?.title?.input}
              onDraftChange={props.onTitleDraftChange}
              onCommit={props.onCommitTitle}
              onSubmit={props.onSubmitTitle}
            />
          </div>
        </div>

        {props.properties.length ? (
          <div className={props.slots?.property?.list}>
            {props.properties.map(property => (
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
                  mode={props.mode}
                  openOnClick
                  onSelect={props.onSelect}
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
