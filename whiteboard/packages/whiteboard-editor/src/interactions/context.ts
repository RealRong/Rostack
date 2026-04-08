import type { BoardConfig } from '@whiteboard/core/config'
import type { Editor } from '../types/editor'
import type { SnapRuntime } from '../runtime/interaction/snap'
import type { SelectionInternalRead } from '../runtime/read/selection'

export type InteractionContext = {
  read: Editor['read']
  selection: SelectionInternalRead
  write: Editor['write']
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
