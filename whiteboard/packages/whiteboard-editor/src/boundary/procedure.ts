import type {
  InputDelta,
  SceneItem,
  State
} from '@whiteboard/editor-scene'

export interface EditorPublished {
  revision: number
  graph: State['graph']
  items: readonly SceneItem[]
  ui: State['ui']
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
  state: State,
  revision: number
): EditorPublished => ({
  revision,
  graph: state.graph,
  items: state.items,
  ui: state.ui
})
