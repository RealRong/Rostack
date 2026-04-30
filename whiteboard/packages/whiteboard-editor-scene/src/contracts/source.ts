import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Document as WhiteboardDocument } from '@whiteboard/core/types'
import type { MutationDelta } from '@shared/mutation'
import type { Revision } from '@shared/projection'
import type {
  DragState,
  DraftInput,
  EditSession,
  HoverState,
  PreviewInput,
  SceneViewSnapshot,
  ToolState
} from './editor'

export interface EditorSceneSourceSnapshot {
  document: {
    rev: Revision
    doc: WhiteboardDocument
  }
  session: {
    selection: SelectionTarget
    edit: EditSession | null
    draft: DraftInput
    preview: PreviewInput
    tool: ToolState
  }
  interaction: {
    hover: HoverState
    drag: DragState
    chrome: boolean
    editingEdge: boolean
  }
  view: SceneViewSnapshot
}

export interface EditorSceneSourceChange {
  document?: {
    rev: Revision
    delta: MutationDelta
    reset: boolean
  }
  session?: {
    tool?: true
    selection?: true
    edit?: true
    preview?: true
  }
  interaction?: {
    hover?: true
    drag?: true
    chrome?: true
    editingEdge?: true
  }
  view?: true
}

export interface EditorSceneSource {
  get(): EditorSceneSourceSnapshot
  subscribe(listener: (change: EditorSceneSourceChange) => void): () => void
}
