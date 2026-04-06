export const KANBAN_EMPTY_BUCKET_KEY = '(empty)'

export type KanbanNewRecordPosition = 'start' | 'end'

export interface KanbanOptions {
  newRecordPosition: KanbanNewRecordPosition
  fillColumnColor: boolean
}
