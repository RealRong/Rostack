import {
  elementRectIn,
  type Rect
} from '@dataview/react/dom/geometry'
import type {
  AppearanceId,
  SectionKey
} from '@dataview/react/view'

export interface CardLayout {
  id: AppearanceId
  rect: Rect
}

export interface CardPosition {
  id: AppearanceId
  top: number
  height: number
}

export interface ColumnLayout {
  key: SectionKey
  rect: Rect
  bodyRect: Rect
  cards: readonly CardLayout[]
}

export interface BoardLayout {
  columns: readonly ColumnLayout[]
}

export const readBoardLayout = (
  container: HTMLElement | null,
  positionsByColumnKey?: ReadonlyMap<SectionKey, readonly CardPosition[]>
): BoardLayout | null => {
  if (!container) {
    return null
  }

  const columns = Array.from(
    container.querySelectorAll<HTMLElement>('[data-kanban-column-key]')
  ).reduce<ColumnLayout[]>((result, columnNode) => {
      const key = columnNode.dataset.kanbanColumnKey
      if (!key) {
        return result
      }

      const bodyNode = columnNode.querySelector<HTMLElement>('[data-kanban-column-body]')
      const bodyTarget = bodyNode ?? columnNode
      const bodyRect = elementRectIn(container, bodyTarget)
      const positions = positionsByColumnKey?.get(key)
      const cards: CardLayout[] = positions
        ? positions.map(position => ({
            id: position.id,
            rect: {
              left: bodyRect.left,
              right: bodyRect.right,
              top: bodyRect.top + position.top,
              bottom: bodyRect.top + position.top + position.height,
              width: bodyRect.width,
              height: position.height
            }
          }))
        : Array.from(
          bodyTarget.querySelectorAll<HTMLElement>('[data-kanban-card-id]')
        )
          .map(cardNode => {
            const id = cardNode.dataset.kanbanCardId
            if (!id) {
              return undefined
            }

            return {
              id,
              rect: elementRectIn(container, cardNode)
            } satisfies CardLayout
          })
          .filter((card): card is CardLayout => Boolean(card))

      result.push({
        key,
        rect: elementRectIn(container, columnNode),
        bodyRect,
        cards
      })

      return result
    }, [])

  return {
    columns
  }
}
