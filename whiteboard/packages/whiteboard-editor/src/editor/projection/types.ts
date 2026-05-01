import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorDerived } from '@whiteboard/editor/editor/derived/types'

export type EditorProjection = EditorScene & {
  derived: EditorDerived
}
