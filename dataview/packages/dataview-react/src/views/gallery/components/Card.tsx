import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import type {
  DataRecord,
  RecordId
} from '@dataview/core/contracts'
import {
  isEmptyFieldValue
} from '@dataview/core/field'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/react/dom/appearance'
import {
  shouldCapturePointer
} from '@shared/dom'
import {
  useDataView,
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import {
  CardContent
} from '@dataview/react/views/shared'
import { resolveNeutralCardStyle } from '@shared/ui/color'
import { cn } from '@shared/ui/utils'
import type { ItemId } from '@dataview/engine'
import { useGalleryContext } from '@dataview/react/views/gallery/context'
import {
  CARD_TITLE_PLACEHOLDER
} from '@dataview/react/views/shared/cardTitleValue'
import {
  useCardEditingState
} from '@dataview/react/views/shared/useCardTitleEditing'

export const Card = (props: {
  itemId: ItemId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const {
    active,
    extra,
    runtime
  } = useGalleryContext()
  const dataView = useDataView()
  const engine = dataView.engine
  const recordId = engine.active.read.item(props.itemId)?.recordId ?? '' as RecordId
  const record = useDataViewKeyedValue(
    current => current.engine.select.records.byId,
    recordId
  )
  if (!record) {
    return null
  }

  return (
    <GalleryCardContent
      itemId={props.itemId}
      record={record}
      measureRef={props.measureRef}
      className={props.className}
      style={props.style}
    />
  )
}

const GalleryCardContent = (props: {
  itemId: ItemId
  record: DataRecord
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const {
    active,
    extra,
    runtime
  } = useGalleryContext()
  const viewId = active.view.id
  const fields = active.fields.custom
  const selected = runtime.selection.selectedIdSet.has(props.itemId)
  const draggingActive = runtime.drag.activeId === props.itemId
  const draggingSelected = runtime.drag.activeId !== undefined
    && runtime.drag.dragIdSet.has(props.itemId)
  const canDrag = extra.canReorder
  const [hovered, setHovered] = useState(false)
  const editing = useCardEditingState({
    viewId,
    itemId: props.itemId
  })
  const cardNodeRef = useRef<HTMLElement | null>(null)
  const measureRefRef = useRef(props.measureRef)
  measureRefRef.current = props.measureRef
  const marqueeActiveRef = useRef(runtime.marqueeActive)
  marqueeActiveRef.current = runtime.marqueeActive
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

    runtime.visualTargets.register(props.itemId, node)

    return () => {
      if (marqueeActiveRef.current) {
        runtime.visualTargets.freeze(props.itemId, node)
      }
      runtime.visualTargets.register(props.itemId, null)
    }
  }, [props.itemId, runtime.visualTargets])

  return (
    <CardContent
      ref={contentRef}
      {...{
        [DATAVIEW_APPEARANCE_ID_ATTR]: props.itemId
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

        runtime.drag.onPointerDown(props.itemId, event)
      }}
      onClick={event => {
        if (editing) {
          return
        }

        if (runtime.drag.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        runtime.selection.select(
          props.itemId,
          event.metaKey || event.ctrlKey ? 'toggle' : 'replace'
        )
      }}
      className={cn(
        'min-w-0',
        'touch-none',
        !editing && 'select-none',
        !editing && canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        draggingActive && 'opacity-35',
        draggingSelected && !draggingActive && 'opacity-60',
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
      itemId={props.itemId}
      record={props.record}
      fields={fields}
      titlePlaceholder={CARD_TITLE_PLACEHOLDER}
      showEditAction={hovered && !editing && !draggingActive}
    />
  )
}
