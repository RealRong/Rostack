import type { BoardConfig } from '@whiteboard/core/config'
import type { SelectionInput } from '@whiteboard/core/selection'
import type { EdgeId, NodeId, Point } from '@whiteboard/core/types'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { EditorCommandRuntime } from '@whiteboard/editor/command'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { SelectionModelRead } from '@whiteboard/editor/query/selection/model'
import type { LayoutRuntime } from '@whiteboard/editor/layout/runtime'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EditCaret, EditField } from '@whiteboard/editor/local/session/edit'

export type InputLocal = {
  tool: {
    set: (tool: Tool) => void
  }
  selection: {
    replace: (target: SelectionInput) => void
    clear: () => void
  }
  edit: {
    startNode: (
      nodeId: NodeId,
      field: EditField,
      options?: {
        caret?: EditCaret
      }
    ) => void
    startEdgeLabel: (
      edgeId: EdgeId,
      labelId: string,
      options?: {
        caret?: EditCaret
      }
    ) => void
  }
  viewport: {
    panScreenBy: (delta: Point) => void
  }
}

export type InteractionContext = {
  query: EditorQueryRead
  selection: SelectionModelRead
  command: EditorCommandRuntime
  local: InputLocal
  layout: LayoutRuntime
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
