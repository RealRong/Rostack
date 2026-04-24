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
}>

export const createEditorGraphDelta = (
  input: EditorGraphDeltaFlags = {}
): InputDelta => {
  const delta = createEmptyInputDelta()

  if (input.document) {
    delta.document.reset = true
  }
  if (input.graph) {
    delta.graph.nodes.preview = {
      added: new Set(),
      updated: new Set(['__graph__']),
      removed: new Set()
    }
  }
  if (input.ui) {
    delta.ui.selection = true
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
