import {
  elementRectIn,
  type Rect
} from '@dataview/dom/geometry'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/dom/appearance'
import type { AppearanceId } from '@dataview/react/runtime/currentView'

export interface CardLayout {
  id: AppearanceId
  rect: Rect
}

export interface GalleryLayout {
  cards: readonly CardLayout[]
}

export const readGalleryLayout = (
  container: HTMLElement | null
): GalleryLayout | null => {
  if (!container) {
    return null
  }

  const cards = Array.from(
    container.querySelectorAll<HTMLElement>(`[${DATAVIEW_APPEARANCE_ID_ATTR}]`)
  )
    .map(cardNode => {
      const id = cardNode.getAttribute(DATAVIEW_APPEARANCE_ID_ATTR)
      if (!id) {
        return undefined
      }

      return {
        id,
        rect: elementRectIn(container, cardNode)
      } satisfies CardLayout
    })
    .filter((card): card is CardLayout => Boolean(card))
    .sort((left, right) => (
      left.rect.top === right.rect.top
        ? left.rect.left - right.rect.left
        : left.rect.top - right.rect.top
    ))

  return {
    cards
  }
}
