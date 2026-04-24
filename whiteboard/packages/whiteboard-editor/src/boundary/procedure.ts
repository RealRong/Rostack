import type {
  GraphSnapshot,
  InputDelta,
  SceneItem,
  Snapshot,
  UiSnapshot
} from '@whiteboard/editor-graph'

export interface EditorPublished {
  revision: number
  graph: GraphSnapshot
  items: readonly SceneItem[]
  ui: UiSnapshot
}

export type EditorPublishRequest = {
  kind: 'publish'
  delta?: InputDelta
}

export type EditorTaskRequest =
  | {
      kind: 'task'
      lane: 'microtask'
      procedure: EditorProcedure<void>
    }
  | {
      kind: 'task'
      lane: 'frame'
      procedure: EditorProcedure<void>
    }
  | {
      kind: 'task'
      lane: 'delay'
      delayMs: number
      procedure: EditorProcedure<void>
    }

export type EditorProcedureSignal =
  | EditorPublishRequest
  | EditorTaskRequest

export type EditorProcedure<TResult = void> = Generator<
  EditorProcedureSignal,
  TResult,
  EditorPublished
>

export const toEditorPublished = (
  snapshot: Snapshot
): EditorPublished => ({
  revision: snapshot.revision,
  graph: snapshot.graph,
  items: snapshot.items,
  ui: snapshot.ui
})
