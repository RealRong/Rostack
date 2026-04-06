import type {
  KanbanNewRecordPosition,
  KanbanOptions
} from '../contracts/kanban'
import {
  isJsonObject
} from './shared'

const DEFAULT_NEW_RECORD_POSITION: KanbanNewRecordPosition = 'end'
const DEFAULT_FILL_COLUMN_COLOR = true

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
      : DEFAULT_FILL_COLUMN_COLOR
  }
}

export const cloneKanbanOptions = (
  options: KanbanOptions
): KanbanOptions => ({
  newRecordPosition: options.newRecordPosition,
  fillColumnColor: options.fillColumnColor
})
