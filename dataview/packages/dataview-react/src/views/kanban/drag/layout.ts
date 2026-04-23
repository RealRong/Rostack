import {
  intersects,
  type Rect
} from '@shared/dom'
import type {
  ItemId,
  Section,
  SectionId
} from '@dataview/engine'
import type {
  KanbanVisibility
} from '@dataview/react/views/kanban/types'

export interface CardLayout {
  id: ItemId
  rect: Rect
}

export interface ColumnLayout {
  key: SectionId
  rect: Rect
  bodyRect: Rect
  cards: readonly CardLayout[]
}

export interface BoardLayout {
  columns: readonly ColumnLayout[]
}

export const KANBAN_CARD_GAP = 8
export const KANBAN_CARD_ESTIMATED_HEIGHT = 132

export const buildBoardLayout = (input: {
  sections: readonly Section[]
  visibilityBySection: ReadonlyMap<SectionId, KanbanVisibility | undefined>
  bodyRectBySectionId: ReadonlyMap<SectionId, Rect>
  heightById: ReadonlyMap<ItemId, number>
  estimatedHeight?: number
}): BoardLayout | null => {
  const estimatedHeight = input.estimatedHeight ?? KANBAN_CARD_ESTIMATED_HEIGHT
  const columns = input.sections.flatMap<ColumnLayout>(section => {
    const bodyRect = input.bodyRectBySectionId.get(section.id)
    if (!bodyRect) {
      return []
    }

    const visibleIds = input.visibilityBySection.get(section.id)?.ids ?? section.itemIds
    let top = bodyRect.top
    const cards = visibleIds.map<CardLayout>(id => {
      const height = input.heightById.get(id) ?? estimatedHeight
      const rect = {
        left: bodyRect.left,
        right: bodyRect.right,
        top,
        bottom: top + height,
        width: bodyRect.width,
        height
      }
      top += height + KANBAN_CARD_GAP
      return {
        id,
        rect
      }
    })

    return [{
      key: section.id,
      rect: bodyRect,
      bodyRect,
      cards
    }]
  })

  return columns.length
    ? {
        columns
      }
    : null
}

export const hitTestBoardLayout = (
  layout: BoardLayout | null,
  rect: Rect
): readonly ItemId[] => {
  if (!layout) {
    return []
  }

  return layout.columns.flatMap(column => {
    if (
      rect.right <= column.bodyRect.left
      || rect.left >= column.bodyRect.right
    ) {
      return []
    }

    return column.cards.flatMap(card => {
      if (card.rect.bottom <= rect.top) {
        return []
      }

      if (card.rect.top >= rect.bottom) {
        return []
      }

      return intersects(rect, card.rect)
        ? [card.id]
        : []
    })
  })
}
