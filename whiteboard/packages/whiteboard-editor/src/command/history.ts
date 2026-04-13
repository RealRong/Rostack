import type { Engine } from '@whiteboard/engine'
import type { HistoryCommands } from '#whiteboard-editor/types/commands'

export const createHistoryCommands = (
  engine: Engine
): HistoryCommands => ({
  get: engine.history.get,
  undo: engine.history.undo,
  redo: engine.history.redo,
  clear: engine.history.clear
})
