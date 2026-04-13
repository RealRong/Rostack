import type {
  KanbanCardsPerColumn,
  KanbanNewRecordPosition,
  KanbanOptions
} from '#core/contracts/kanban.ts'
import {
  isJsonObject
} from '#core/view/shared.ts'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS
} from '#core/contracts/kanban.ts'

const DEFAULT_NEW_RECORD_POSITION: KanbanNewRecordPosition = 'end'
const DEFAULT_FILL_COLUMN_COLOR = true
const DEFAULT_CARDS_PER_COLUMN: KanbanCardsPerColumn = 'all'

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
    newRecordPosition: kanban?.newRecordPosition === 'start'
      ? 'start'
      : DEFAULT_NEW_RECORD_POSITION,
    fillColumnColor: typeof kanban?.fillColumnColor === 'boolean'
      ? kanban.fillColumnColor
      : DEFAULT_FILL_COLUMN_COLOR,
    cardsPerColumn: normalizeCardsPerColumn(kanban?.cardsPerColumn)
  }
}

export const cloneKanbanOptions = (
  options: KanbanOptions
): KanbanOptions => ({
  newRecordPosition: options.newRecordPosition,
  fillColumnColor: options.fillColumnColor,
  cardsPerColumn: options.cardsPerColumn
})
