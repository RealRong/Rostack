import type { HistoryPort } from '@shared/mutation'
import type { IntentResult } from '@whiteboard/engine'
import type { HistoryWrite } from '@whiteboard/editor/write/types'

export const createHistoryWrite = (
  history: Pick<HistoryPort<IntentResult>, 'undo' | 'redo' | 'clear'>
): HistoryWrite => ({
  undo: history.undo,
  redo: history.redo,
  clear: history.clear
})
