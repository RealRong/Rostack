import {
  memo,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  isEmptyFieldValue
} from '@dataview/core/field'
import type {
  ViewFieldRef
} from '@dataview/engine'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/react/dom/appearance'
import {
  type Card,
  type CardContent as CardContentData
} from '@dataview/runtime'
import { shouldCapturePointer } from '@shared/dom'
import { cn } from '@shared/ui/utils'
import type { ItemId } from '@dataview/engine'
import { EditableCardTitle } from '@dataview/react/views/shared/EditableCardTitle'
import { CardFieldSlot } from '@dataview/react/views/shared/CardFieldSlot'
import { CardContent } from '@dataview/react/views/shared/CardContent'
import { resolveCardPresentation } from '@dataview/react/views/shared/cardPresentation'

export interface RecordCardDragRuntime {
  activeId: ItemId | undefined
  dragIdSet: ReadonlySet<ItemId>
  shouldIgnoreClick: () => boolean
  onPointerDown: (id: ItemId, event: ReactPointerEvent<HTMLElement>) => void
}

export interface RecordCardSelectionRuntime {
  select: (id: ItemId, mode?: 'replace' | 'toggle') => void
}

export interface RecordCardInteraction {
  drag: RecordCardDragRuntime
  selection: RecordCardSelectionRuntime
}

export interface RecordCardAppearance {
  showEditAction?: boolean
  selectedStyle?: CSSProperties
  resolveSurface?: (input: {
    selected: boolean
  }) => {
    default?: Pick<CSSProperties, 'backgroundColor' | 'boxShadow'>
    hover?: Pick<CSSProperties, 'backgroundColor' | 'boxShadow'>
  } | undefined
}

export interface RecordCardMount {
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}

export interface RecordCardProps {
  card: Card
  content: CardContentData
  interaction: RecordCardInteraction
  appearance: RecordCardAppearance
  mount?: RecordCardMount
}

const fieldRef = (input: {
  viewId: Card['viewId']
  itemId: Card['itemId']
  recordId: Card['recordId']
  fieldId: string
}): ViewFieldRef => ({
  viewId: input.viewId,
  itemId: input.itemId,
  recordId: input.recordId,
  fieldId: input.fieldId
})

const RecordCardComponent = (props: RecordCardProps) => {
  const draggingActive = props.interaction.drag.activeId === props.card.itemId
  const draggingSelected = props.interaction.drag.activeId !== undefined
    && props.interaction.drag.dragIdSet.has(props.card.itemId)
  const editing = props.card.editing
  const selected = props.card.selected

  const presentation = resolveCardPresentation({
    size: props.card.size,
    layout: props.card.layout,
    hasVisibleFields: props.content.hasProperties,
    selected
  })
  const surface = props.appearance.resolveSurface?.({
    selected
  })
  const surfaceDefault = surface?.default
  const surfaceHover = editing
    ? surface?.default
    : (surface?.hover ?? surface?.default)
  const surfaceStyle = useMemo(() => ({
    ...(surfaceDefault?.backgroundColor ? {
      '--dv-record-card-bg': surfaceDefault.backgroundColor
    } : {}),
    ...(surfaceHover?.backgroundColor ? {
      '--dv-record-card-bg-hover': surfaceHover.backgroundColor
    } : {}),
    ...(surfaceDefault?.boxShadow ? {
      '--dv-record-card-shadow': surfaceDefault.boxShadow
    } : {}),
    ...(surfaceHover?.boxShadow ? {
      '--dv-record-card-shadow-hover': surfaceHover.boxShadow
    } : {}),
    ...(surfaceDefault?.backgroundColor ? {
      backgroundColor: 'var(--dv-record-card-bg)'
    } : {}),
    ...(surfaceDefault?.boxShadow ? {
      boxShadow: 'var(--dv-record-card-shadow)'
    } : {})
  }) as CSSProperties, [
    surfaceDefault?.backgroundColor,
    surfaceDefault?.boxShadow,
    surfaceHover?.backgroundColor,
    surfaceHover?.boxShadow
  ])
  const title = useMemo(() => (
    <EditableCardTitle
      viewId={props.card.viewId}
      itemId={props.card.itemId}
      recordId={props.card.recordId}
      titleText={props.content.titleText}
      placeholderText={props.content.placeholderText}
      wrap={props.card.wrap}
      showEditAction={props.appearance.showEditAction && !draggingActive}
      rootClassName={presentation.slots.title?.content}
      textClassName={presentation.slots.title?.text}
      inputClassName={presentation.slots.title?.input}
    />
  ), [
    draggingActive,
    presentation.slots.title?.content,
    presentation.slots.title?.input,
    presentation.slots.title?.text,
    props.appearance.showEditAction,
    props.card.itemId,
    props.card.recordId,
    props.card.viewId,
    props.card.wrap,
    props.content.placeholderText,
    props.content.titleText
  ])
  const visibleProperties = useMemo(() => (
    editing
      ? props.content.properties
      : props.content.properties.filter(property => !isEmptyFieldValue(property.value))
  ), [editing, props.content.properties])
  const properties = useMemo(() => visibleProperties.map(property => ({
    key: property.field.id,
    node: (
      <CardFieldSlot
        field={fieldRef({
          viewId: props.card.viewId,
          itemId: props.card.itemId,
          recordId: props.card.recordId,
          fieldId: property.field.id
        })}
        customField={property.field}
        value={property.value}
        mode={editing ? 'edit' : 'view'}
        openOnClick
        density={presentation.propertyDensity}
        wrap={props.card.wrap}
        valueClassName={presentation.slots.property?.value}
      />
    )
  })), [
    editing,
    presentation.propertyDensity,
    presentation.slots.property?.value,
    props.card.itemId,
    props.card.recordId,
    props.card.viewId,
    props.card.wrap,
    visibleProperties
  ])

  return (
    <CardContent
      ref={props.mount?.measureRef}
      {...{
        [DATAVIEW_APPEARANCE_ID_ATTR]: props.card.itemId
      }}
      onPointerDown={event => {
        if (editing) {
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.interaction.drag.onPointerDown(props.card.itemId, event)
      }}
      onClick={event => {
        if (editing) {
          return
        }

        if (props.interaction.drag.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.interaction.selection.select(
          props.card.itemId,
          event.metaKey || event.ctrlKey ? 'toggle' : 'replace'
        )
      }}
      className={cn(
        'group/record-card',
        'min-w-0',
        'touch-none',
        'transition-[background-color,box-shadow]',
        !editing && 'select-none',
        !editing && props.card.canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        !editing && surfaceHover?.backgroundColor && 'hover:bg-[var(--dv-record-card-bg-hover)]',
        !editing && surfaceHover?.boxShadow && 'hover:[box-shadow:var(--dv-record-card-shadow-hover)]',
        draggingActive && 'opacity-35',
        draggingSelected && !draggingActive && 'opacity-60',
        props.mount?.className
      )}
      style={{
        ...surfaceStyle,
        ...(selected
          ? props.appearance.selectedStyle
          : undefined),
        ...props.mount?.style
      }}
      slots={presentation.slots}
      titleNode={title}
      properties={properties}
    />
  )
}

export const RecordCard = memo(RecordCardComponent)
