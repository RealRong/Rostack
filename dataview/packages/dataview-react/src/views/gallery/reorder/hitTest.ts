import type { Rect } from '@shared/dom'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import type {
  GalleryLayoutCache
} from '#react/views/gallery/virtual/index.ts'

type GalleryCard = GalleryLayoutCache['cards'][number]

export interface GalleryDropTarget {
  sectionKey: SectionKey
  anchorId: ItemId
  side: 'left' | 'right'
  beforeItemId?: ItemId
  indicator: {
    left: number
    top: number
    height: number
  }
}

const EDGE_OFFSET = 8

interface RowHitLayout {
  sectionKey: SectionKey
  top: number
  bottom: number
  cards: readonly GalleryCard[]
}

const rowDistance = (
  row: Pick<RowHitLayout, 'top' | 'bottom'>,
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
  rows: readonly RowHitLayout[],
  y: number
) => rows.reduce<RowHitLayout | undefined>((best, row) => {
  if (!best) {
    return row
  }

  return rowDistance(row, y) < rowDistance(best, y)
    ? row
    : best
}, undefined)

const centerX = (rect: Rect) => rect.left + rect.width / 2

export const dropTargetFromPoint = (
  layout: GalleryLayoutCache | null,
  point: {
    x: number
    y: number
  },
  excludeIds: readonly ItemId[] = []
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

  const cardsByRowKey = cards.reduce<Map<string, GalleryCard[]>>((map, card) => {
    const key = `${card.sectionKey}\u0000${card.rowIndex}`
    const current = map.get(key)
    if (current) {
      current.push(card)
      return map
    }

    map.set(key, [card])
    return map
  }, new Map())
  const rows = layout.rows.flatMap<RowHitLayout>(row => {
    const rowCards = cardsByRowKey.get(`${row.sectionKey}\u0000${row.rowIndex}`)
    if (!rowCards?.length) {
      return []
    }

    return [{
      sectionKey: row.sectionKey,
      top: row.top,
      bottom: row.top + row.height,
      cards: rowCards
    }]
  })
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
      sectionKey: row.sectionKey,
      anchorId: firstCard.id,
      side: 'left',
      beforeItemId: firstCard.id,
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
        sectionKey: row.sectionKey,
        anchorId: card.id,
        side,
        beforeItemId: side === 'left' ? card.id : nextCard?.id,
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
        sectionKey: row.sectionKey,
        anchorId: nextRowCard.id,
        side: 'left',
        beforeItemId: nextRowCard.id,
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
    sectionKey: row.sectionKey,
    anchorId: lastCard.id,
    side: 'right',
    beforeItemId: nextVisibleCard?.id,
    indicator: {
      left: lastCard.rect.right + EDGE_OFFSET,
      top: lastCard.rect.top,
      height: lastCard.rect.height
    }
  }
}
