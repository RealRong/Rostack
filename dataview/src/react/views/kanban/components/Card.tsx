import type { GroupRecord } from '@dataview/core/contracts'
import { shouldCapturePointer } from '@dataview/dom/interactive'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/currentView'
import { useBoardContext } from '../board'
import { CardSurface } from './CardSurface'

export const Card = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  measureRef?: (node: HTMLDivElement | null) => void
}) => {
  const controller = useBoardContext()
  const selected = controller.selection.selectedIdSet.has(props.appearanceId)
  const marqueeSelected = controller.selection.marqueeIdSet.has(props.appearanceId)
  const active = controller.drag.activeId === props.appearanceId
  const draggingSelected = controller.drag.activeId !== undefined
    && controller.drag.dragIdSet.has(props.appearanceId)
  const canDrag = controller.canReorder

  return (
    <div
      ref={node => {
        props.measureRef?.(node)
      }}
      data-kanban-card-id={props.appearanceId}
      onPointerDown={event => {
        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        controller.drag.onPointerDown(props.appearanceId, event)
      }}
      onClick={event => {
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
        'touch-none select-none',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        active && 'opacity-35',
        draggingSelected && !active && 'opacity-60'
      )}
    >
      <CardSurface
        appearanceId={props.appearanceId}
        record={props.record}
        selected={selected}
        marqueeSelected={marqueeSelected}
        onSelect={mode => controller.selection.select(props.appearanceId, mode)}
      />
    </div>
  )
}
