import type { Rect } from '@dataview/dom/geometry'
import type { DropTarget } from './ids'
import type {
  BoardLayout
} from './layout'
const centerX = (rect: Rect) => rect.left + rect.width / 2

const resolveColumn = (
  layout: BoardLayout,
  x: number
) => {
  const containing = layout.columns.find(column => (
    x >= column.bodyRect.left && x <= column.bodyRect.right
  ))
  if (containing) {
    return containing
  }

  return layout.columns.reduce<typeof layout.columns[number] | undefined>((closest, column) => {
    if (!closest) {
      return column
    }

    return Math.abs(centerX(column.bodyRect) - x) < Math.abs(centerX(closest.bodyRect) - x)
      ? column
      : closest
  }, undefined)
}

export const dropTargetFromPoint = (
  layout: BoardLayout | null,
  point: {
    x: number
    y: number
  }
): DropTarget | undefined => {
  if (!layout) {
    return undefined
  }

  const column = resolveColumn(layout, point.x)
  if (!column) {
    return undefined
  }

  const beforeCard = column.cards.find(card => point.y < card.rect.top + card.rect.height / 2)
  return beforeCard
    ? {
        sectionKey: column.key,
        beforeAppearanceId: beforeCard.id
      }
    : {
        sectionKey: column.key
      }
}
