import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/local/session/edit'

export type SelectionSessionDeps = {
  replaceSelection: (input: SelectionInput) => void
  clearSelection: () => void
}

export type EditSessionDeps = {
  startNodeEdit: (
    nodeId: NodeId,
    field: EditField,
    options?: {
      caret?: EditCaret
    }
  ) => void
  startEdgeLabelEdit: (
    edgeId: EdgeId,
    labelId: string,
    options?: {
      caret?: EditCaret
    }
  ) => void
  clearEdit: () => void
}
