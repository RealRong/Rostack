import {
  forwardRef,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactNode
} from 'react'
import { SquarePen } from 'lucide-react'
import type {
  CustomField,
  DataRecord,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import type {
  ViewFieldRef
} from '@dataview/engine'
import { isEmptyFieldValue } from '@dataview/core/field'
import { Button } from '@shared/ui/button'
import { cn } from '@shared/ui/utils'
import { CardFieldSlot } from './CardFieldSlot'
import { CardTitle } from './CardTitle'
import { useCardTitleEditing } from './useCardTitleEditing'

const fieldRef = (input: {
  viewId: ViewId
  itemId: ItemId
  recordId: string
  fieldId: string
}): ViewFieldRef => ({
  viewId: input.viewId,
  itemId: input.itemId,
  recordId: input.recordId,
  fieldId: input.fieldId
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
  itemId: ItemId
  record: DataRecord
  fields: readonly CustomField[]
  titlePlaceholder: string
  showEditAction?: boolean
  titleLeading?: ReactNode
  propertyDensity?: 'default' | 'compact'
}

export const CardContent = forwardRef<HTMLElement, CardContentProps>((props, ref) => {
  const {
    slots,
    viewId,
    itemId,
    record,
    fields,
    titlePlaceholder,
    showEditAction,
    titleLeading,
    propertyDensity,
    className,
    ...rootProps
  } = props
  const editing = useCardTitleEditing({
    viewId,
    itemId,
    record
  })
  const fieldProperties = useMemo(() => fields, [fields])
  const visibleFields = useMemo(() => (
    editing.mode === 'edit'
      ? fieldProperties
      : fieldProperties.filter(property => !isEmptyFieldValue(record.values[property.id]))
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

      {visibleFields.length ? (
        <div className={slots?.property?.list}>
          {visibleFields.map(property => (
            <div key={property.id} className={slots?.property?.item}>
              <CardFieldSlot
                field={fieldRef({
                  viewId,
                  itemId,
                  recordId: record.id,
                  fieldId: property.id
                })}
                customField={property}
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
