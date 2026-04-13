import type { BoardConfig } from '@whiteboard/core/config'
import type { EditorQueryRead } from '#whiteboard-editor/query'
import type { EditorCommandRuntime } from '#whiteboard-editor/command'
import type { EditorLocalActions } from '#whiteboard-editor/local/runtime'
import type { SnapRuntime } from '#whiteboard-editor/input/core/snap'
import type { SelectionModelRead } from '#whiteboard-editor/query/selection/model'

export type InteractionContext = {
  query: EditorQueryRead
  selection: SelectionModelRead
  command: EditorCommandRuntime
  local: EditorLocalActions
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
