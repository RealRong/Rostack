import {
  elementRectIn,
  type Rect
} from '@dataview/dom/geometry'
import type { AppearanceId } from '@dataview/react/currentView'

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
    container.querySelectorAll<HTMLElement>('[data-gallery-card-id]')
  )
    .map(cardNode => {
      const id = cardNode.dataset.galleryCardId
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
