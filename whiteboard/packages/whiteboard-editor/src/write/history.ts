import type { Engine } from '@whiteboard/engine'
import type { HistoryWrite } from '@whiteboard/editor/write/types'

export const createHistoryWrite = (
  engine: Engine
): HistoryWrite => ({
  undo: engine.history.undo,
  redo: engine.history.redo,
  clear: engine.history.clear
})
