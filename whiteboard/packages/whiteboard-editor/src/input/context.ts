import type { BoardConfig } from '@whiteboard/core/config'
import type { EditorRead } from '../types/editor'
import type { EditorCommands } from '../write'
import type { SnapRuntime } from './core/snap'
import type { SelectionModelRead } from '../read/selectionModel'

export type InteractionContext = {
  read: EditorRead
  selection: SelectionModelRead
  write: EditorCommands
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
