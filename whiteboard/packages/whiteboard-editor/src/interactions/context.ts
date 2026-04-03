import type { BoardConfig } from '@whiteboard/core/config'
import type { Editor } from '../types/editor'
import type { SnapRuntime } from '../runtime/interaction/snap'

export type InteractionContext = {
  read: Editor['read']
  write: Editor['write']
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
