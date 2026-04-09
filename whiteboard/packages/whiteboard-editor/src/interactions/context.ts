import type { BoardConfig } from '@whiteboard/core/config'
import type { Editor, EditorWriteApi } from '../types/editor'
import type { SnapRuntime } from '../runtime/interaction/snap'
import type { SelectionInternalRead } from '../runtime/read/selection'

export type InteractionContext = {
  read: Editor['read']
  selection: SelectionInternalRead
  write: EditorWriteApi
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
