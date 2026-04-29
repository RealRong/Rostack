import { EMPTY_MUTATION_CHANGE_MAP } from '@shared/mutation'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import type {
  NodeDraftMeasure,
  RuntimeInputDelta,
  TextMeasure
} from '../contracts/editor'
import {
  createWhiteboardMutationDelta,
  type WhiteboardMutationDelta
} from '../mutation/delta'
import { createEmptyRuntimeInputDelta } from './input'

export type EditorRuntimeDeltaFlags = Partial<{
  graph: boolean
  ui: boolean
}>

export const createEditorRuntimeDelta = (
  input: EditorRuntimeDeltaFlags = {}
): RuntimeInputDelta => {
  const delta = createEmptyRuntimeInputDelta()

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

export const createMutationDelta = (input: {
  reset?: boolean
} = {}): WhiteboardMutationDelta => createWhiteboardMutationDelta({
  ...(input.reset
    ? {
        reset: true
      }
    : {}),
  changes: EMPTY_MUTATION_CHANGE_MAP
})

export interface EditorGraphTextMeasureState {
  nodeMeasures?: ReadonlyMap<NodeId, NodeDraftMeasure>
  edgeLabelMeasures?: ReadonlyMap<EdgeId, ReadonlyMap<string, Size>>
}

export const createEditorGraphTextMeasure = (
  read: () => EditorGraphTextMeasureState
): TextMeasure => (target) => {
  const current = read()

  switch (target.kind) {
    case 'node':
      return current.nodeMeasures?.get(target.nodeId)
    case 'edge-label': {
      const size = current.edgeLabelMeasures
        ?.get(target.edgeId)
        ?.get(target.labelId)
      return size
        ? {
            kind: 'size',
            size
          }
        : undefined
    }
  }
}
