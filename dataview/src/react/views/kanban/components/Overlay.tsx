import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@ui/utils'
import { useBoardContext } from '../board'
import { CardSurface } from './CardSurface'

export const Overlay = () => {
  const controller = useBoardContext()
  const appearanceId = controller.drag.activeId
  const record = appearanceId
    ? controller.readRecord(appearanceId)
    : undefined
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const pointer = controller.drag.pointerRef.current
  const offset = controller.drag.overlayOffsetRef.current

  useEffect(() => {
    if (!record || typeof window === 'undefined') {
      return
    }

    let frame = 0
    const update = () => {
      const pointer = controller.drag.pointerRef.current
      const offset = controller.drag.overlayOffsetRef.current
      const node = overlayRef.current
      if (pointer && node) {
        node.style.transform = `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
      }
      frame = window.requestAnimationFrame(update)
    }

    frame = window.requestAnimationFrame(update)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [controller.drag.overlayOffsetRef, controller.drag.pointerRef, record])

  if (!appearanceId || !record || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed left-0 top-0 z-[999]"
      style={{
        width: controller.drag.overlaySize.width || Math.max(220, controller.layout.columnWidth - 32),
        transform: pointer
          ? `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
          : 'translate3d(-9999px, -9999px, 0)'
      }}
    >
      <div className="relative">
        {controller.drag.dragIds.length > 1 ? (
          <>
            <div className="ui-surface-floating absolute inset-x-3 top-3 h-full rounded-2xl opacity-60" />
            <div className="ui-surface-floating absolute inset-x-1.5 top-1.5 h-full rounded-2xl opacity-80" />
          </>
        ) : null}
        <div className={cn(controller.drag.dragIds.length > 1 && 'relative')}>
          <CardSurface
            appearanceId={appearanceId}
            record={record}
            selected={false}
            dragging
            dragCount={controller.drag.dragIds.length}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
