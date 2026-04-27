import type { SelectionTarget } from '@whiteboard/core/selection'
import type { EnginePublish } from '@whiteboard/engine'
import type {
  ClockInput,
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
    publish: EnginePublish
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
  clock: ClockInput
}

export interface EditorSceneSourceChange {
  document?: true
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
  clock?: true
}

export interface EditorSceneSource {
  get(): EditorSceneSourceSnapshot
  subscribe(listener: (change: EditorSceneSourceChange) => void): () => void
}
