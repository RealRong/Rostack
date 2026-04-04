import {
  useState
} from 'react'
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
  measureRef?: (node: HTMLDivElement | null) => void
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

  return (
    <div
      ref={node => {
        props.measureRef?.(node)
      }}
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
        'touch-none',
        !editing && 'select-none',
        !editing && canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        active && 'opacity-35',
        draggingSelected && !active && 'opacity-60'
      )}
    >
      <CardContent
        slots={{
          root: cn(
            'ui-surface-content relative rounded-2xl px-4 py-2.5 transition-colors',
            selected && 'border-primary bg-primary/[0.05]'
          ),
          title: {
            text: 'text-[15px] font-semibold leading-5',
            input: 'text-[15px] font-semibold leading-5 text-foreground'
          },
          property: {
            list: 'mx-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pt-0 leading-5',
            item: 'inline-flex min-w-0 max-w-full',
            value: 'text-xs leading-5 text-foreground'
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
    </div>
  )
}
