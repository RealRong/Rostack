import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@/core/contracts'
import { shouldCapturePointer } from '@/react/dom/interactive'
import { cn } from '@/react/ui'
import type { AppearanceId } from '@/react/view'
import { CardBody } from './CardBody'

export const Card = (props: {
  appearanceId: AppearanceId
  record: GroupRecord
  viewId: ViewId
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  selected: boolean
  marqueeSelected: boolean
  active: boolean
  draggingSelected: boolean
  canDrag: boolean
  shouldIgnoreClick: () => boolean
  onPointerDown: (appearanceId: AppearanceId, event: React.PointerEvent<HTMLDivElement>) => void
  onSelect: (mode?: 'replace' | 'toggle') => void
}) => {
  return (
    <div
      data-gallery-card-id={props.appearanceId}
      onPointerDown={event => {
        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.onPointerDown(props.appearanceId, event)
      }}
      onClick={event => {
        if (props.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.onSelect(event.metaKey || event.ctrlKey ? 'toggle' : 'replace')
      }}
      className={cn(
        'touch-none select-none',
        props.canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        props.active && 'opacity-35',
        props.draggingSelected && !props.active && 'opacity-60'
      )}
    >
      <CardBody
        appearanceId={props.appearanceId}
        record={props.record}
        viewId={props.viewId}
        titleProperty={props.titleProperty}
        properties={props.properties}
        selected={props.selected}
        marqueeSelected={props.marqueeSelected}
      />
    </div>
  )
}
