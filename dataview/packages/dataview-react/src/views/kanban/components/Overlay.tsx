import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { RecordId } from '@dataview/core/contracts'
import {
  useDataView,
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import { CardPreview } from '@dataview/react/views/shared'
import {
  resolveNeutralCardStyle,
  resolveOptionCardStyle
} from '@shared/ui/color'
import { cn } from '@shared/ui/utils'
import { useKanbanContext } from '@dataview/react/views/kanban/context'
import { resolveCardPresentation } from '@dataview/react/views/shared/cardPresentation'

const stackedCardStyle = resolveNeutralCardStyle('default', 'preview')

export const Overlay = () => {
  const {
    active,
    extra,
    runtime
  } = useKanbanContext()
  const engine = useDataView().engine
  const itemId = runtime.drag.activeId
  const recordId = itemId
    ? engine.active.read.item(itemId)?.recordId
    : undefined
  const record = useDataViewKeyedValue(
    dataView => dataView.engine.select.records.byId,
    (recordId ?? '' as RecordId)
  )
  const sectionColorId = itemId && extra.groupUsesOptionColors
    ? engine.active.read.section(
        engine.active.read.item(itemId)?.sectionKey ?? ''
      )?.color
    : undefined
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const pointer = runtime.drag.pointerRef.current
  const offset = runtime.drag.overlayOffsetRef.current

  useEffect(() => {
    if (!record || typeof window === 'undefined') {
      return
    }

    let frame = 0
    const update = () => {
      const pointer = runtime.drag.pointerRef.current
      const offset = runtime.drag.overlayOffsetRef.current
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
  }, [record, runtime.drag.overlayOffsetRef, runtime.drag.pointerRef])

  if (!itemId || !record || typeof document === 'undefined') {
    return null
  }

  const presentation = resolveCardPresentation({
    size: extra.card.size,
    layout: extra.card.layout,
    hasVisibleFields: active.fields.custom.length > 0,
    selected: false
  })

  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed left-0 top-0 z-[999]"
      style={{
        width: runtime.drag.overlaySize.width || Math.max(220, runtime.layout.columnWidth - 32),
        transform: pointer
          ? `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
          : 'translate3d(-9999px, -9999px, 0)'
      }}
    >
      <div className="relative">
        {runtime.drag.dragIds.length > 1 ? (
          <>
            <div
              className="absolute inset-x-3 top-3 h-full rounded-2xl opacity-60"
              style={stackedCardStyle}
            />
            <div
              className="absolute inset-x-1.5 top-1.5 h-full rounded-2xl opacity-80"
              style={stackedCardStyle}
            />
          </>
        ) : null}
        <div className={cn(runtime.drag.dragIds.length > 1 && 'relative')}>
          <CardPreview
            style={extra.fillColumnColor
              ? resolveOptionCardStyle(sectionColorId)
              : resolveNeutralCardStyle('default', 'preview')}
            record={record}
            fields={active.fields.custom}
            titlePlaceholder={record.id}
            propertyDensity={presentation.propertyDensity}
            wrap={extra.card.wrap}
            showEmptyProperties
            emptyPlaceholder="—"
            slots={presentation.slots}
            badge={runtime.drag.dragIds.length > 1 ? (
              <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                {runtime.drag.dragIds.length}
              </span>
            ) : undefined}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
