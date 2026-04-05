import { useEffect, useMemo, useRef } from 'react'
import { resolveOptionColumnStyle } from '@ui/color'
import { cn } from '@ui/utils'
import type { Section } from '@dataview/react/runtime/currentView'
import { useKanbanContext } from '../context'
import { useColumnVirtual } from '../virtual'
import { Card } from './Card'
import { ColumnDropIndicator } from './ColumnDropIndicator'

const FILLED_COLUMN_INSET = 8
const CARD_GAP = 8

export const ColumnBody = (props: {
  section: Section
}) => {
  const controller = useKanbanContext()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const overTarget = controller.drag.overTarget
  const sectionOverTarget = overTarget?.sectionKey === props.section.key
    ? overTarget
    : undefined
  const overscan = useMemo(
    () => controller.boostedSectionKeySet.has(props.section.key) ? 960 : undefined,
    [controller.boostedSectionKeySet, props.section.key]
  )
  const isColumnTarget = !!sectionOverTarget && !sectionOverTarget.beforeAppearanceId
  const virtual = useColumnVirtual({
    ids: props.section.ids,
    bodyRef,
    overscan
  })
  const contentInset = controller.fillColumnColor
    ? FILLED_COLUMN_INSET
    : 0

  useEffect(() => {
    controller.layouts.set(props.section.key, virtual.layouts)
    return () => {
      controller.layouts.clear(props.section.key)
    }
  }, [controller.layouts, props.section.key, virtual.layouts])

  const indicatorTop = sectionOverTarget
    ? sectionOverTarget.beforeAppearanceId
      ? Math.max(0, (virtual.positionById.get(sectionOverTarget.beforeAppearanceId)?.top ?? virtual.totalHeight) - 4)
      : Math.max(0, virtual.totalHeight - 4)
    : undefined
  const firstItem = virtual.items[0]
  const windowStartTop = firstItem?.top ?? 0
  const contentHeight = Math.max(
    controller.layout.columnMinHeight,
    virtual.totalHeight
  )

  return (
    <div
      ref={bodyRef}
      data-kanban-column-body
      className={cn(
        'relative rounded-2xl transition-colors',
        isColumnTarget && 'outline outline-2 outline-primary/20 -outline-offset-2'
      )}
      style={{
        ...(controller.fillColumnColor
          ? resolveOptionColumnStyle(controller.readSectionColorId(props.section.key))
          : undefined),
        overflowAnchor: 'none',
        padding: contentInset || undefined,
        minHeight: Math.max(controller.layout.columnMinHeight, props.section.ids.length ? 0 : 120)
      }}
    >
      {props.section.ids.length ? (
        <div
          style={{
            position: 'relative',
            height: contentHeight,
            overflowAnchor: 'none'
          }}
        >
          {indicatorTop !== undefined ? (
            <ColumnDropIndicator
              top={indicatorTop}
            />
          ) : null}
          {virtual.items.length ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                transform: `translateY(${windowStartTop}px)`
              }}
            >
              <div
                className="flex flex-col"
                style={{
                  gap: CARD_GAP
                }}
              >
                {virtual.items.map(item => {
                  const record = controller.readRecord(item.id)
                  if (!record) {
                    return null
                  }

                  return (
                    <Card
                      key={item.id}
                      appearanceId={item.id}
                      record={record}
                      measureRef={virtual.measure(item.id)}
                    />
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            'flex h-full items-center justify-center rounded-2xl border border-dashed bg-surface-muted/55 px-4 py-8 text-center text-sm text-fg-muted',
            isColumnTarget && 'border-primary/40 bg-primary/[0.04] text-foreground/80'
          )}
        >
          Drop a card here or add the first one.
        </div>
      )}
    </div>
  )
}
