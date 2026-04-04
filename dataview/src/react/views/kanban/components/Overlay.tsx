import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CardPreview } from '@dataview/react/views/shared'
import { resolveOptionCardStyle } from '@ui/color'
import { cn } from '@ui/utils'
import { useKanbanContext } from '../context'

export const Overlay = () => {
  const controller = useKanbanContext()
  const appearanceId = controller.drag.activeId
  const record = appearanceId
    ? controller.readRecord(appearanceId)
    : undefined
  const sectionColorId = appearanceId
    ? controller.readAppearanceColorId(appearanceId)
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
            <div className="absolute inset-x-3 top-3 h-full rounded-2xl border bg-surface opacity-60 shadow-popover" />
            <div className="absolute inset-x-1.5 top-1.5 h-full rounded-2xl border bg-surface opacity-80 shadow-popover" />
          </>
        ) : null}
        <div className={cn(controller.drag.dragIds.length > 1 && 'relative')}>
          <CardPreview
            style={controller.groupUsesOptionColors
              ? resolveOptionCardStyle(sectionColorId)
              : undefined}
            record={record}
            titleProperty={controller.titleProperty}
            properties={controller.properties}
            titlePlaceholder={record.id}
            propertyDensity="compact"
            showEmptyProperties
            emptyPlaceholder="—"
            slots={{
              root: 'relative rounded-2xl border bg-surface px-4 py-2.5 shadow-popover transition-colors',
              title: {
                row: 'min-w-0',
                rowWhenProperties: 'pb-2',
                text: 'text-[15px] font-semibold leading-5'
              },
              property: {
                list: 'mx-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pt-0 leading-5',
                item: 'inline-flex min-w-0 max-w-full',
                value: 'text-xs leading-5 text-foreground'
              }
            }}
            badge={controller.drag.dragIds.length > 1 ? (
              <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                {controller.drag.dragIds.length}
              </span>
            ) : undefined}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
