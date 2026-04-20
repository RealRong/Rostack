import type { HistoryApi } from '@whiteboard/history'
import type { HistoryWrite } from '@whiteboard/editor/write/types'

export const createHistoryWrite = (
  history: Pick<HistoryApi, 'undo' | 'redo' | 'clear'>
): HistoryWrite => ({
  undo: history.undo,
  redo: history.redo,
  clear: history.clear
})
