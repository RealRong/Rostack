import type {
  KanbanCardsPerColumn,
  KanbanOptions
} from '@dataview/core/types/state'
import { cloneCardOptions, normalizeCardOptions } from '@dataview/core/view/card'
import {
  isJsonObject
} from '@dataview/core/view/shared'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS
} from '@dataview/core/types/state'

const DEFAULT_FILL_COLUMN_COLOR = true
const DEFAULT_CARDS_PER_COLUMN: KanbanCardsPerColumn = 25

const normalizeCardsPerColumn = (
  value: unknown
): KanbanCardsPerColumn => (
  KANBAN_CARDS_PER_COLUMN_OPTIONS.includes(
    value as KanbanCardsPerColumn
  )
    ? value as KanbanCardsPerColumn
    : DEFAULT_CARDS_PER_COLUMN
)

export const normalizeKanbanOptions = (
  value: unknown
): KanbanOptions => {
  const kanban = isJsonObject(value) ? value : undefined

  return {
    card: normalizeCardOptions(kanban?.card, {
      layout: 'compact'
    }),
    fillColumnColor: typeof kanban?.fillColumnColor === 'boolean'
      ? kanban.fillColumnColor
      : DEFAULT_FILL_COLUMN_COLOR,
    cardsPerColumn: normalizeCardsPerColumn(kanban?.cardsPerColumn)
  }
}

export const cloneKanbanOptions = (
  options: KanbanOptions
): KanbanOptions => ({
  card: cloneCardOptions(options.card),
  fillColumnColor: options.fillColumnColor,
  cardsPerColumn: options.cardsPerColumn
})
