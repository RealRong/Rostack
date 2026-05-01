import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  Document as WhiteboardDocument,
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
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

export interface EditorSceneSourceEditChange {
  touchedDraftEdgeIds: readonly EdgeId[]
}

export interface EditorSceneSourcePreviewChange {
  touchedNodeIds: readonly NodeId[]
  touchedEdgeIds: readonly EdgeId[]
  touchedMindmapIds: readonly MindmapId[]
  marquee: boolean
  guides: boolean
  draw: boolean
  edgeGuide: boolean
  hover: boolean
}

export interface EditorSceneSourceChange {
  document?: {
    rev: Revision
    delta: MutationDelta
    reset: boolean
  }
  editor?: {
    delta: MutationDelta
    edit?: EditorSceneSourceEditChange
  }
  session?: {
    preview?: EditorSceneSourcePreviewChange
  }
  view?: true
}

export interface EditorSceneSource {
  get(): EditorSceneSourceSnapshot
  subscribe(listener: (change: EditorSceneSourceChange) => void): () => void
}
