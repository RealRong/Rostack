import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { FileText } from 'lucide-react'
import type {
  Row,
  RecordId
} from '@dataview/core/contracts'
import {
  isEmptyFieldValue
} from '@dataview/core/field'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/dom/appearance'
import {
  shouldCapturePointer
} from '@shared/dom'
import {
  useDataView
} from '@dataview/react/dataview'
import { useKeyedStoreValue } from '@shared/react'
import {
  CardContent
} from '@dataview/react/views/shared'
import { resolveNeutralCardStyle } from '@ui/color'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/engine/project'
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
  record: Row
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const controller = useGalleryContext()
  const viewId = controller.currentView.view.id
  const fields = controller.fields
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
  const cardNodeRef = useRef<HTMLElement | null>(null)
  const measureRefRef = useRef(props.measureRef)
  measureRefRef.current = props.measureRef
  const marqueeActiveRef = useRef(controller.marqueeActive)
  marqueeActiveRef.current = controller.marqueeActive
  const hasVisibleFields = useMemo(() => fields.some(field => (
    editing
      || !isEmptyFieldValue(props.record.values[field.id])
  )), [editing, fields, props.record])
  const surfaceStyle = !selected
    ? resolveNeutralCardStyle(hovered && !editing ? 'hover' : 'default', 'preview')
    : undefined
  const contentRef = useCallback((node: HTMLElement | null) => {
    cardNodeRef.current = node
    measureRefRef.current?.(node)
  }, [])

  useLayoutEffect(() => {
    const node = cardNodeRef.current
    if (!node) {
      return
    }

    controller.visualTargets.register(props.appearanceId, node)

    return () => {
      if (marqueeActiveRef.current) {
        controller.visualTargets.freeze(props.appearanceId, node)
      }
      controller.visualTargets.register(props.appearanceId, null)
    }
  }, [controller.visualTargets, props.appearanceId])

  return (
    <CardContent
      ref={contentRef}
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
      style={{
        ...surfaceStyle,
        ...props.style
      }}
      slots={{
        root: cn(
          'relative h-full rounded-xl p-3 transition-colors',
          selected && 'border-primary bg-primary/[0.05]'
        ),
        title: {
          row: cn(
            'flex min-w-0 items-start gap-2.5',
            hasVisibleFields && 'pb-2'
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
      fields={fields}
      titlePlaceholder={CARD_TITLE_PLACEHOLDER}
      showEditAction={hovered && !editing && !active}
    />
  )
}
