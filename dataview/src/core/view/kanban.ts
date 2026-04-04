import type {
  GroupKanbanNewRecordPosition,
  GroupKanbanOptions
} from '../contracts/kanban'
import {
  isJsonObject
} from './shared'

const DEFAULT_NEW_RECORD_POSITION: GroupKanbanNewRecordPosition = 'end'
const DEFAULT_FILL_COLUMN_COLOR = true

export const normalizeGroupKanbanOptions = (
  value: unknown
): GroupKanbanOptions => {
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

export const cloneGroupKanbanOptions = (
  options: GroupKanbanOptions
): GroupKanbanOptions => ({
  newRecordPosition: options.newRecordPosition,
  fillColumnColor: options.fillColumnColor
})
