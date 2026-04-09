import type { BoardConfig } from '@whiteboard/core/config'
import type { Editor } from '../types/editor'
import type { EditorRuntime } from '../runtime/editor/runtimeTypes'
import type { SnapRuntime } from '../runtime/interaction/snap'
import type { SelectionInternalRead } from '../runtime/read/selection'

export type InteractionContext = {
  read: Editor['read']
  selection: SelectionInternalRead
  write: EditorRuntime
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
