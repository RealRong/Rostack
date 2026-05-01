import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorSceneUi } from '@whiteboard/editor/types/editor'

export type EditorProjection = EditorScene & {
  ui: Omit<EditorSceneUi, 'state'>
}
