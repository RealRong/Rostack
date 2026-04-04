import {
  useState,
  type CSSProperties
} from 'react'
import { resolveOptionCardStyle } from '@ui/color'
import type {
  GroupRecord,
} from '@dataview/core/contracts'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/dom/appearance'
import { shouldCapturePointer } from '@dataview/dom/interactive'
import {
  useDataView
} from '@dataview/react/dataview'
import { useKeyedStoreValue } from '@dataview/react/store'
import {
  CardContent
} from '@dataview/react/views/shared'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import { useKanbanContext } from '../context'
import {
  useCardEditingState
} from '@dataview/react/views/shared/useCardTitleEditing'

export const Card = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const controller = useKanbanContext()
  const dataView = useDataView()
  const engine = dataView.engine
  const record = useKeyedStoreValue(engine.read.record, props.record.id) ?? props.record
  const titleProperty = controller.titleProperty
  const selected = controller.selection.selectedIdSet.has(props.appearanceId)
  const active = controller.drag.activeId === props.appearanceId
  const draggingSelected = controller.drag.activeId !== undefined
    && controller.drag.dragIdSet.has(props.appearanceId)
  const canDrag = controller.canReorder
  const [hovered, setHovered] = useState(false)
  const editing = useCardEditingState({
    viewId: controller.currentView.view.id,
    appearanceId: props.appearanceId
  })
  const sectionColorId = controller.readAppearanceColorId(props.appearanceId)

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

        controller.selection.select(
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
        ...(controller.groupUsesOptionColors
          ? resolveOptionCardStyle(sectionColorId)
          : undefined),
        ...props.style
      }}
      slots={{
        root: cn(
          'relative rounded-xl border bg-surface p-3 transition-colors',
          selected && 'border-primary'
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
      viewId={controller.currentView.view.id}
      appearanceId={props.appearanceId}
      record={record}
      titleProperty={titleProperty}
      properties={controller.properties}
      titlePlaceholder={record.id}
      showEditAction={hovered && !editing && !active}
      propertyDensity="compact"
    />
  )
}
