import {
  useMemo,
  useState,
  type CSSProperties
} from 'react'
import { FileText } from 'lucide-react'
import type {
  GroupRecord,
  RecordId
} from '@dataview/core/contracts'
import {
  isEmptyPropertyValue
} from '@dataview/core/property'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/dom/appearance'
import {
  shouldCapturePointer
} from '@dataview/dom/interactive'
import {
  useDataView
} from '@dataview/react/dataview'
import { useKeyedStoreValue } from '@dataview/react/store'
import {
  CardContent
} from '@dataview/react/views/shared'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import { useGalleryContext } from '../context'
import {
  CARD_TITLE_PLACEHOLDER
} from '@dataview/react/views/shared/cardTitleValue'
import {
  useCardEditingState
} from '@dataview/react/views/shared/useCardTitleEditing'

export const Card = (props: {
  appearanceId: AppearanceId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const controller = useGalleryContext()
  const dataView = useDataView()
  const engine = dataView.engine
  const recordId = controller.currentView.appearances.get(props.appearanceId)?.recordId ?? '' as RecordId
  const record = useKeyedStoreValue(engine.read.record, recordId)
  if (!record) {
    return null
  }

  return (
    <GalleryCardContent
      appearanceId={props.appearanceId}
      record={record}
      measureRef={props.measureRef}
      className={props.className}
      style={props.style}
    />
  )
}

const GalleryCardContent = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const controller = useGalleryContext()
  const viewId = controller.currentView.view.id
  const titleProperty = controller.titleProperty
  const properties = controller.properties
  const selected = controller.selectedIdSet.has(props.appearanceId)
  const active = controller.drag.activeId === props.appearanceId
  const draggingSelected = controller.drag.activeId !== undefined
    && controller.drag.dragIdSet.has(props.appearanceId)
  const canDrag = controller.canReorder
  const [hovered, setHovered] = useState(false)
  const editing = useCardEditingState({
    viewId,
    appearanceId: props.appearanceId
  })
  const hasVisibleProperties = useMemo(() => properties.some(property => (
    property.id !== titleProperty?.id
    && (
      editing
        || !isEmptyPropertyValue(props.record.values[property.id])
    )
  )), [editing, properties, props.record, titleProperty?.id])

  return (
    <CardContent
      ref={props.measureRef}
      {...{
        [DATAVIEW_APPEARANCE_ID_ATTR]: props.appearanceId
      }}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
      onPointerDown={event => {
        if (editing) {
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        controller.drag.onPointerDown(props.appearanceId, event)
      }}
      onClick={event => {
        if (editing) {
          return
        }

        if (controller.drag.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        controller.select(
          props.appearanceId,
          event.metaKey || event.ctrlKey ? 'toggle' : 'replace'
        )
      }}
      className={cn(
        'min-w-0',
        'touch-none',
        !editing && 'select-none',
        !editing && canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        active && 'opacity-35',
        draggingSelected && !active && 'opacity-60',
        props.className
      )}
      style={props.style}
      slots={{
        root: cn(
          'relative h-full rounded-xl p-3 transition-colors ui-shadow-sm ui-card-bg',
          selected && 'border-primary bg-primary/[0.05]'
        ),
        title: {
          row: cn(
            'flex min-w-0 items-start gap-2.5',
            hasVisibleProperties && 'pb-2'
          ),
          content: 'min-w-0 flex-1',
          text: 'text-base font-semibold leading-6',
          input: 'text-base font-semibold leading-6 text-foreground'
        },
        property: {
          list: 'flex flex-col gap-2',
          item: 'min-w-0',
          value: 'text-[12px]'
        }
      }}
      viewId={viewId}
      appearanceId={props.appearanceId}
      record={props.record}
      titleProperty={titleProperty}
      properties={properties}
      titlePlaceholder={CARD_TITLE_PLACEHOLDER}
      showEditAction={hovered && !editing && !active}
    />
  )
}
