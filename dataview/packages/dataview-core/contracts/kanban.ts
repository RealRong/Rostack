export const KANBAN_EMPTY_BUCKET_KEY = '(empty)'
export const KANBAN_CARDS_PER_COLUMN_OPTIONS = [25, 50, 100, 'all'] as const

export type KanbanNewRecordPosition = 'start' | 'end'
export type KanbanCardsPerColumn = (typeof KANBAN_CARDS_PER_COLUMN_OPTIONS)[number]

export interface KanbanOptions {
  newRecordPosition: KanbanNewRecordPosition
  fillColumnColor: boolean
  cardsPerColumn: KanbanCardsPerColumn
}
