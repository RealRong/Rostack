import type { BoardConfig } from '@whiteboard/core/config'
import type { Editor } from '../../types/editor'
import type { SnapRuntime } from './snap'

export type InteractionCtx = {
  read: Editor['read']
  write: Editor['write']
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
