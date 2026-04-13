import type { BoardConfig } from '@whiteboard/core/config'
import type { EditorQueryRead } from '../query'
import type { EditorCommandRuntime } from '../command'
import type { EditorLocalActions } from '../local/runtime'
import type { SnapRuntime } from './core/snap'
import type { SelectionModelRead } from '../query/selection/model'

export type InteractionContext = {
  query: EditorQueryRead
  selection: SelectionModelRead
  command: EditorCommandRuntime
  local: EditorLocalActions
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
