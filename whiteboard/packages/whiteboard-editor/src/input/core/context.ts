import type { BoardConfig } from '@whiteboard/core/config'
import type { SelectionInput } from '@whiteboard/core/selection'
import type { EdgeId, NodeId, Point } from '@whiteboard/core/types'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorCommands } from '@whiteboard/editor/command'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { SelectionModelRead } from '@whiteboard/editor/query/selection/model'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
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

export type InteractionDeps = {
  query: EditorQuery
  selection: SelectionModelRead
  command: EditorCommands
  local: InputLocal
  layout: EditorLayout
  config: Readonly<BoardConfig>
  snap: SnapRuntime
}
