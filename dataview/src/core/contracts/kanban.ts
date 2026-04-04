export const GROUP_KANBAN_EMPTY_BUCKET_KEY = '(empty)'

export type GroupKanbanNewRecordPosition = 'start' | 'end'

export interface GroupKanbanOptions {
  newRecordPosition: GroupKanbanNewRecordPosition
  fillColumnColor: boolean
}
