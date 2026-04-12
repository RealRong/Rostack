import { useRef } from 'react'
import { DATAVIEW_APPEARANCE_ID_ATTR } from '@dataview/react/dom/appearance'
import { Button } from '@ui/button'
import { cn } from '@ui/utils'
import type { Section } from '@dataview/engine/project'
import { useKanbanContext } from '../context'
import { Card } from './Card'
import { ColumnDropIndicator } from './ColumnDropIndicator'

const CARD_GAP = 8

const findCardNode = (
  container: HTMLElement,
  appearanceId: string
) => Array.from(
  container.querySelectorAll<HTMLElement>(`[${DATAVIEW_APPEARANCE_ID_ATTR}]`)
).find(node => node.getAttribute(DATAVIEW_APPEARANCE_ID_ATTR) === appearanceId)

export const ColumnBody = (props: {
  section: Section
}) => {
  const {
    runtime
  } = useKanbanContext()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const visibility = runtime.visibility.bySection.get(props.section.key)
  const visibleIds = visibility?.visibleIds ?? props.section.appearanceIds
  const visibleCount = visibility?.visibleCount ?? props.section.appearanceIds.length
  const hiddenCount = visibility?.hiddenCount ?? 0
  const showMoreCount = visibility?.showMoreCount ?? 0
  const overTarget = runtime.drag.overTarget
  const sectionOverTarget = overTarget?.sectionKey === props.section.key
    ? overTarget
    : undefined
  const isColumnTarget = !!sectionOverTarget && !sectionOverTarget.beforeAppearanceId
  const indicatorTop = (() => {
    const bodyNode = bodyRef.current
    if (!sectionOverTarget || !bodyNode) {
      return undefined
    }

    const bodyRect = bodyNode.getBoundingClientRect()
    if (sectionOverTarget.beforeAppearanceId) {
      const cardNode = findCardNode(bodyNode, sectionOverTarget.beforeAppearanceId)
      if (!cardNode) {
        return undefined
      }

      return Math.max(0, cardNode.getBoundingClientRect().top - bodyRect.top - 4)
    }

    const cards = Array.from(
      bodyNode.querySelectorAll<HTMLElement>(`[${DATAVIEW_APPEARANCE_ID_ATTR}]`)
    )
    const lastCard = cards[cards.length - 1]
    return lastCard
      ? Math.max(0, lastCard.getBoundingClientRect().bottom - bodyRect.top - 4)
      : undefined
  })()

  return (
    <div
      ref={bodyRef}
      data-kanban-column-body
      className="relative"
      style={{
        overflowAnchor: 'none',
        minHeight: Math.max(runtime.layout.columnMinHeight, props.section.appearanceIds.length ? 0 : 120)
      }}
    >
      {props.section.appearanceIds.length ? (
        <div
          className="flex flex-col"
          style={{
            gap: CARD_GAP,
            overflowAnchor: 'none'
          }}
        >
          {indicatorTop !== undefined ? (
            <ColumnDropIndicator
              top={indicatorTop}
            />
          ) : null}
          {visibleIds.map(id => (
            <Card
              key={id}
              appearanceId={id}
            />
          ))}
          {hiddenCount ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed bg-surface/70 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">
                  {`Showing ${visibleCount} / ${props.section.appearanceIds.length}`}
                </div>
                <div className="text-xs text-fg-muted">
                  {`${hiddenCount} more card${hiddenCount === 1 ? '' : 's'} hidden`}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  runtime.visibility.showMore(props.section.key)
                }}
              >
                {`Show ${showMoreCount} more`}
              </Button>
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
