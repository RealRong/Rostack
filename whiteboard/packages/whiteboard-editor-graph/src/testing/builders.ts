import type { Size } from '@whiteboard/core/types'
import type {
  InputDelta,
  TextMeasureEntry
} from '../contracts/editor'
import { createEmptyInputDelta } from '../runtime/createEmptySnapshot'

export type EditorGraphDeltaFlags = Partial<{
  document: boolean
  graph: boolean
  ui: boolean
  scene: boolean
}>

export const createEditorGraphDelta = (
  input: EditorGraphDeltaFlags = {}
): InputDelta => {
  const delta = createEmptyInputDelta()

  if (input.document) {
    delta.document.reset = true
  }
  if (input.graph) {
    delta.graph.interaction.selection = true
  }
  if (input.ui) {
    delta.ui.selection = true
  }
  if (input.scene) {
    delta.scene.viewport = true
  }

  return delta
}

export const createEditorGraphTextMeasureEntry = (
  size: Size,
  input: Partial<Pick<TextMeasureEntry, 'mode' | 'wrapWidth'>> = {}
): TextMeasureEntry => ({
  size,
  metrics: {
    width: size.width,
    height: size.height
  },
  mode: input.mode ?? 'multi-line',
  wrapWidth: input.wrapWidth
})
