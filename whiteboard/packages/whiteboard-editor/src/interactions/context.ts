import type { BoardConfig } from '@whiteboard/core/config'
import type { EditorRead } from '../types/editor'
import type { EditorServices } from '../runtime/editor/services'
import type { SnapRuntime } from '../runtime/interaction/snap'
import type { SelectionModelRead } from '../runtime/read/selection'

export type InteractionContext = {
  read: EditorRead
  selection: SelectionModelRead
  write: EditorServices
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
