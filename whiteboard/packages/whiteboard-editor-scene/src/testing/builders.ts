import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import type {
  InputDelta,
  TextMeasure
} from '../contracts/editor'
import { createEmptyInputDelta } from './input'

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
    delta.session.preview.nodes = {
      added: new Set(),
      updated: new Set(['__graph__']),
      removed: new Set()
    }
  }
  if (input.ui) {
    delta.session.selection = true
  }
  return delta
}

export interface EditorGraphTextMeasureState {
  nodeMeasures?: ReadonlyMap<NodeId, Size>
  edgeLabelMeasures?: ReadonlyMap<EdgeId, ReadonlyMap<string, Size>>
}

export const createEditorGraphTextMeasure = (
  read: () => EditorGraphTextMeasureState
): TextMeasure => (target) => {
  const current = read()

  switch (target.kind) {
    case 'node':
      return current.nodeMeasures?.get(target.nodeId)
    case 'edge-label':
      return current.edgeLabelMeasures
        ?.get(target.edgeId)
        ?.get(target.labelId)
  }
}
