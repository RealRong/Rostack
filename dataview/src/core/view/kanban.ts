import type {
  GroupKanbanNewRecordPosition,
  GroupKanbanOptions
} from '../contracts/kanban'
import {
  isJsonObject
} from './shared'

const DEFAULT_NEW_RECORD_POSITION: GroupKanbanNewRecordPosition = 'end'

export const normalizeGroupKanbanOptions = (
  value: unknown
): GroupKanbanOptions => {
  const kanban = isJsonObject(value) ? value : undefined

  return {
    newRecordPosition: kanban?.newRecordPosition === 'start'
      ? 'start'
      : DEFAULT_NEW_RECORD_POSITION
  }
}

export const cloneGroupKanbanOptions = (
  options: GroupKanbanOptions
): GroupKanbanOptions => ({
  newRecordPosition: options.newRecordPosition
})
