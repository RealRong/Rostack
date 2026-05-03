import type { Engine } from '@whiteboard/engine'
import type { HistoryWrite } from '@whiteboard/editor/write/types'
import { cancelled } from '@whiteboard/engine/result'

export const createHistoryWrite = (
  history: Pick<Engine['history'], 'undo' | 'redo' | 'clear'>
): HistoryWrite => ({
  undo: () => history.undo() ?? cancelled('Nothing to undo.'),
  redo: () => history.redo() ?? cancelled('Nothing to redo.'),
  clear: history.clear
})
