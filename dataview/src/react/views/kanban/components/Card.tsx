import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import {
  resolveNeutralCardStyle,
  resolveOptionCardStyle
} from '@ui/color'
import type {
  RecordId
} from '@dataview/core/contracts'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/react/dom/appearance'
import { shouldCapturePointer } from '@shared/dom'
import {
  useDataView,
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import {
  CardContent
} from '@dataview/react/views/shared'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/engine/project'
import { useKanbanContext } from '../context'
import {
  useCardEditingState
} from '@dataview/react/views/shared/useCardTitleEditing'

export const Card = (props: {
  appearanceId: AppearanceId
  className?: string
  style?: CSSProperties
}) => {
  const {
    active,
    extra,
    runtime
  } = useKanbanContext()
  const dataView = useDataView()
  const engine = dataView.engine
  const recordId = engine.active.read.getAppearanceRecordId(props.appearanceId) ?? '' as RecordId
  const record = useDataViewKeyedValue(
    current => current.engine.read.record,
    recordId
  )
  const selected = runtime.selection.selectedIdSet.has(props.appearanceId)
  const draggingActive = runtime.drag.activeId === props.appearanceId
  const draggingSelected = runtime.drag.activeId !== undefined
    && runtime.drag.dragIdSet.has(props.appearanceId)
  const canDrag = extra.canReorder
  const [hovered, setHovered] = useState(false)
  const editing = useCardEditingState({
    viewId: active.view.id,
    appearanceId: props.appearanceId
  })
  const cardNodeRef = useRef<HTMLElement | null>(null)
  const marqueeActiveRef = useRef(runtime.marqueeActive)
  marqueeActiveRef.current = runtime.marqueeActive
  const sectionColorId = extra.groupUsesOptionColors
    ? engine.active.read.getAppearanceColor(props.appearanceId)
    : undefined
  const surfaceState = hovered && !editing ? 'hover' : 'default'
  const surfaceStyle = extra.fillColumnColor
    ? resolveOptionCardStyle(sectionColorId, surfaceState)
    : resolveNeutralCardStyle(surfaceState, 'preview')
  const contentRef = useCallback((node: HTMLElement | null) => {
    cardNodeRef.current = node
  }, [])

  useLayoutEffect(() => {
    const node = cardNodeRef.current
    if (!node) {
      return
    }

    runtime.visualTargets.register(props.appearanceId, node)

    return () => {
      if (marqueeActiveRef.current) {
        runtime.visualTargets.freeze(props.appearanceId, node)
      }
      runtime.visualTargets.register(props.appearanceId, null)
    }
  }, [props.appearanceId, runtime.visualTargets])

  if (!record) {
    return null
  }

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

        runtime.drag.onPointerDown(props.appearanceId, event)
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
          props.appearanceId,
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
        ...(selected
          ? {
            boxShadow: 'var(--ui-shadow-sm), 0 0 0 2px var(--ui-accent-frame-border)'
          }
          : undefined),
        ...props.style
      }}
      slots={{
        root: cn(
          'relative rounded-xl px-3 py-2.5 transition-colors'
        ),
        title: {
          content: 'min-w-0 flex-1 w-full',
          text: 'font-semibold',
          input: 'font-semibold text-foreground'
        },
        property: {
          list: 'flex flex-wrap items-center gap-2 mt-1',
          item: 'inline-flex min-w-0 max-w-full',
          value: 'text-sm text-foreground'
        }
      }}
      viewId={active.view.id}
      appearanceId={props.appearanceId}
      record={record}
      fields={active.fields.custom}
      titlePlaceholder={record.id}
      showEditAction={hovered && !editing && !draggingActive}
      propertyDensity="compact"
    />
  )
}
