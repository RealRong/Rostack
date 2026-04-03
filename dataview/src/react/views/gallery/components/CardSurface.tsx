import { FileText, SquarePen } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type {
  GroupProperty,
  GroupRecord,
  PropertyId,
  ViewId
} from '@dataview/core/contracts'
import {
  isEmptyPropertyValue
} from '@dataview/core/property'
import {
  focusInputWithoutScroll
} from '@dataview/dom/focus'
import type {
  ViewFieldRef
} from '@dataview/engine/projection/view'
import { CardPropertySlot } from '@dataview/react/views/shared'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/currentView'

const TITLE_PLACEHOLDER = '输入名称...'

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

export const CardSurface = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  viewId: ViewId
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  selected?: boolean
  marqueeSelected?: boolean
  dragging?: boolean
  dragCount?: number
  mode?: 'view' | 'edit'
  showEditAction?: boolean
  titleDraft?: string
  onTitleDraftChange?: (value: string) => void
  onEnterEdit?: () => void
  onCommitTitle?: () => void
  onSelect?: () => void
}) => {
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const fieldPropertyIds: readonly PropertyId[] = Array.from(new Set(
    [
      props.titleProperty,
      ...props.properties
    ].filter((property): property is GroupProperty => Boolean(property))
      .map(property => property.id)
  ))
  const mode = props.mode ?? 'view'
  const titleValue = props.titleProperty
    ? props.record.values[props.titleProperty.id]
    : undefined
  const titleText = typeof titleValue === 'string'
    ? titleValue
    : titleValue === undefined || titleValue === null
      ? ''
      : String(titleValue)
  const visibleProperties = useMemo(() => (
    mode === 'edit'
      ? props.properties
      : props.properties.filter(property => !isEmptyPropertyValue(props.record.values[property.id]))
  ), [mode, props.properties, props.record.values])

  useEffect(() => {
    if (mode !== 'edit') {
      return
    }

    focusInputWithoutScroll(titleInputRef.current, {
      select: true
    })
  }, [mode])

  return (
    <div
      className={cn(
        'relative p-3 transition-colors ui-shadow-sm ui-card-bg rounded-lg',
        props.selected && 'border-primary bg-primary/[0.05]',
        !props.selected && props.marqueeSelected && 'border-primary/40 bg-primary/[0.04]',
        props.dragging && 'shadow-lg'
      )}
    >
      {props.showEditAction ? (
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-2 top-2 z-10"
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
      {props.dragging && (props.dragCount ?? 0) > 1 ? (
        <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
          {props.dragCount}
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2.5 pb-2">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" size={18} strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            {mode === 'edit' ? (
              <Input
                ref={titleInputRef}
                value={props.titleDraft ?? ''}
                placeholder={TITLE_PLACEHOLDER}
                className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-base font-semibold leading-6 text-foreground shadow-none focus-visible:ring-0"
                onClick={event => {
                  event.stopPropagation()
                }}
                onChange={event => props.onTitleDraftChange?.(event.target.value)}
                onBlur={() => {
                  props.onCommitTitle?.()
                }}
                onKeyDown={event => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    props.onCommitTitle?.()
                  }
                }}
              />
            ) : (
              <div
                className={cn(
                  'min-w-0 text-base font-semibold leading-6',
                  titleText.trim()
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                <div className="truncate">
                  {titleText.trim() || TITLE_PLACEHOLDER}
                </div>
              </div>
            )}
          </div>
        </div>

        {visibleProperties.length ? (
          <div className="flex flex-col pb-2 pt-0 leading-6">
            {visibleProperties.map(property => (
              <div key={property.id} className="min-w-0 pb-2 last:pb-0">
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
                  mode={mode}
                  onSelect={props.onSelect}
                  valueClassName="text-[13px] leading-6 text-foreground"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
