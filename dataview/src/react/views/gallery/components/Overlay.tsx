import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import { cn } from '@ui/utils'
import type { AppearanceId } from '@dataview/react/view'
import { CardBody } from './CardBody'

export const Overlay = (props: {
  appearanceId?: AppearanceId
  record?: GroupRecord
  viewId: ViewId
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  dragCount: number
  width?: number
  pointerRef: { current: { x: number; y: number } | null }
  overlayOffsetRef: { current: { x: number; y: number } }
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const pointer = props.pointerRef.current
  const offset = props.overlayOffsetRef.current

  useEffect(() => {
    if (!props.record || typeof window === 'undefined') {
      return
    }

    let frame = 0
    const update = () => {
      const nextPointer = props.pointerRef.current
      const nextOffset = props.overlayOffsetRef.current
      const node = overlayRef.current
      if (nextPointer && node) {
        node.style.transform = `translate3d(${Math.round(nextPointer.x - nextOffset.x)}px, ${Math.round(nextPointer.y - nextOffset.y)}px, 0)`
      }
      frame = window.requestAnimationFrame(update)
    }

    frame = window.requestAnimationFrame(update)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [props.overlayOffsetRef, props.pointerRef, props.record])

  if (!props.record || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed left-0 top-0 z-[999]"
      style={{
        width: props.width,
        transform: pointer
          ? `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
          : 'translate3d(-9999px, -9999px, 0)'
      }}
    >
      <div className="relative">
        {props.dragCount > 1 ? (
          <>
            <div className="absolute inset-x-3 top-3 h-full rounded-3xl border bg-background/80 shadow-sm" />
            <div className="absolute inset-x-1.5 top-1.5 h-full rounded-3xl border bg-background/90 shadow-sm" />
          </>
        ) : null}
        <div className={cn(props.dragCount > 1 && 'relative')}>
          <CardBody
            appearanceId={props.appearanceId ?? props.record.id}
            record={props.record}
            viewId={props.viewId}
            titleProperty={props.titleProperty}
            properties={props.properties}
            dragging
            dragCount={props.dragCount}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
