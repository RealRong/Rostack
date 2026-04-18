import {
  useCallback,
  useMemo,
  useRef
} from 'react'
import { DATAVIEW_APPEARANCE_ID_ATTR } from '@dataview/react/dom/appearance'
import { Button } from '@shared/ui/button'
import type { ItemId, SectionKey } from '@dataview/engine'
import { useKanbanRuntimeContext } from '@dataview/react/views/kanban/KanbanView'
import { Card } from '@dataview/react/views/kanban/components/Card'
import { ColumnDropIndicator } from '@dataview/react/views/kanban/components/ColumnDropIndicator'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'

const CARD_GAP = 8

const findCardNode = (
  container: HTMLElement,
  itemId: ItemId
) => Array.from(
  container.querySelectorAll<HTMLElement>(`[${DATAVIEW_APPEARANCE_ID_ATTR}]`)
).find(node => node.getAttribute(DATAVIEW_APPEARANCE_ID_ATTR) === String(itemId))

export const ColumnBody = (props: {
  sectionKey: SectionKey
}) => {
  const runtime = useKanbanRuntimeContext()
  const board = useStoreValue(runtime.board)
  const section = useKeyedStoreValue(runtime.section, props.sectionKey)
  if (!section) {
    return null
  }
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const measureBodyRef = useMemo(
    () => runtime.geometry.measureBody(section.key),
    [runtime.geometry.measureBody, section.key]
  )
  const setBodyRef = useCallback((node: HTMLDivElement | null) => {
    bodyRef.current = node
    measureBodyRef(node)
  }, [measureBodyRef])
  const visibleIds = section.visibleIds
  const visibleCount = section.visibleCount
  const hiddenCount = section.hiddenCount
  const showMoreCount = section.showMoreCount
  const overTarget = runtime.drag.overTarget
  const sectionOverTarget = overTarget?.sectionKey === section.key
    ? overTarget
    : undefined
  const indicatorTop = (() => {
    const bodyNode = bodyRef.current
    if (!sectionOverTarget || !bodyNode) {
      return undefined
    }

    const bodyRect = bodyNode.getBoundingClientRect()
    if (sectionOverTarget.beforeItemId) {
      const cardNode = findCardNode(bodyNode, sectionOverTarget.beforeItemId)
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
      ref={setBodyRef}
      data-kanban-column-body
      className="relative"
      style={{
        overflowAnchor: 'none',
        minHeight: Math.max(board.columnMinHeight, section.count ? 0 : 120)
      }}
    >
      {section.count ? (
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
              itemId={id}
              measureRef={runtime.geometry.measureCard(id)}
            />
          ))}
          {hiddenCount ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">
                  {`Showing ${visibleCount} / ${section.count}`}
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
                  runtime.visibility.showMore(section.key)
                }}
              >
                {`Show ${showMoreCount} more`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{ minHeight: Math.max(board.columnMinHeight, section.count ? 0 : 120) }}
          className={'flex h-full flex-1 min-h-full items-center justify-center px-4 py-8 text-center text-sm text-fg-muted'}
        >
          Drop a card here or add the first one.
        </div>
      )}
    </div>
  )
}
