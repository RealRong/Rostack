import type { Rect } from '@dataview/react/dom/geometry'
import type { AppearanceId } from '@dataview/react/currentView'
import type {
  GalleryLayout
} from './layout'

export interface GalleryDropTarget {
  anchorId: AppearanceId
  side: 'left' | 'right'
  beforeAppearanceId?: AppearanceId
  indicator: {
    left: number
    top: number
    height: number
  }
}

const ROW_TOLERANCE = 16
const EDGE_OFFSET = 8

interface RowLayout {
  cards: GalleryLayout['cards']
  top: number
  bottom: number
}

const groupRows = (cards: GalleryLayout['cards']) => {
  return cards.reduce<RowLayout[]>((rows, card) => {
    const current = rows[rows.length - 1]
    if (!current || Math.abs(card.rect.top - current.top) > ROW_TOLERANCE) {
      rows.push({
        cards: [card],
        top: card.rect.top,
        bottom: card.rect.bottom
      })
      return rows
    }

    const nextCards = [...current.cards, card]
    rows[rows.length - 1] = {
      cards: nextCards,
      top: Math.min(current.top, card.rect.top),
      bottom: Math.max(current.bottom, card.rect.bottom)
    }
    return rows
  }, [])
}

const rowDistance = (
  row: RowLayout,
  y: number
) => {
  if (y < row.top) {
    return row.top - y
  }
  if (y > row.bottom) {
    return y - row.bottom
  }
  return 0
}

const resolveRow = (
  rows: readonly RowLayout[],
  y: number
) => rows.reduce<RowLayout | undefined>((best, row) => {
  if (!best) {
    return row
  }

  return rowDistance(row, y) < rowDistance(best, y)
    ? row
    : best
}, undefined)

const centerX = (rect: Rect) => rect.left + rect.width / 2

export const dropTargetFromPoint = (
  layout: GalleryLayout | null,
  point: {
    x: number
    y: number
  },
  excludeIds: readonly AppearanceId[] = []
): GalleryDropTarget | undefined => {
  if (!layout) {
    return undefined
  }

  const excludeIdSet = excludeIds.length ? new Set(excludeIds) : undefined
  const cards = excludeIdSet
    ? layout.cards.filter(card => !excludeIdSet.has(card.id))
    : layout.cards
  if (!cards.length) {
    return undefined
  }

  const rows = groupRows(cards)
  const row = resolveRow(rows, point.y)
  if (!row || !row.cards.length) {
    return undefined
  }

  const firstCard = row.cards[0]
  const lastCard = row.cards[row.cards.length - 1]
  if (!firstCard || !lastCard) {
    return undefined
  }

  if (point.x <= firstCard.rect.left) {
      return {
        anchorId: firstCard.id,
        side: 'left',
        beforeAppearanceId: firstCard.id,
        indicator: {
          left: Math.max(0, firstCard.rect.left - EDGE_OFFSET),
          top: firstCard.rect.top,
        height: firstCard.rect.height
      }
    }
  }

  for (let index = 0; index < row.cards.length; index += 1) {
    const card = row.cards[index]
    if (!card) {
      continue
    }

    const absoluteIndex = cards.findIndex(item => item.id === card.id)
    const nextCard = absoluteIndex >= 0
      ? cards[absoluteIndex + 1]
      : undefined

    if (point.x >= card.rect.left && point.x <= card.rect.right) {
      const side = point.x < centerX(card.rect) ? 'left' : 'right'

      return {
        anchorId: card.id,
        side,
        beforeAppearanceId: side === 'left' ? card.id : nextCard?.id,
        indicator: {
          left: side === 'left'
            ? Math.max(0, card.rect.left - EDGE_OFFSET)
            : card.rect.right + EDGE_OFFSET,
          top: card.rect.top,
          height: card.rect.height
        }
      }
    }

    const nextRowCard = row.cards[index + 1]
    if (nextRowCard && point.x > card.rect.right && point.x < nextRowCard.rect.left) {
      return {
        anchorId: nextRowCard.id,
        side: 'left',
        beforeAppearanceId: nextRowCard.id,
        indicator: {
          left: Math.max(0, nextRowCard.rect.left - EDGE_OFFSET),
          top: nextRowCard.rect.top,
          height: nextRowCard.rect.height
        }
      }
    }
  }

  const lastAbsoluteIndex = cards.findIndex(item => item.id === lastCard.id)
  const nextVisibleCard = lastAbsoluteIndex >= 0
    ? cards[lastAbsoluteIndex + 1]
    : undefined

  return {
    anchorId: lastCard.id,
    side: 'right',
    beforeAppearanceId: nextVisibleCard?.id,
    indicator: {
      left: lastCard.rect.right + EDGE_OFFSET,
      top: lastCard.rect.top,
      height: lastCard.rect.height
    }
  }
}
