import {
  createMutationDelta as createTypedMutationDelta,
  createMutationResetDelta,
} from '@shared/mutation'
import {
  createWhiteboardLayout,
  type LayoutNodeCatalog,
  type NodeDraftMeasure
} from '@whiteboard/core/layout'
import {
  type WhiteboardMutationDelta
} from '@whiteboard/engine/mutation'
import {
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import type { EditorStateMutationDelta } from '@whiteboard/editor/state/runtime'
import { createMutationDelta as createEditorStateDelta } from '@shared/mutation'
import { editorStateMutationSchema } from '@whiteboard/editor/state/model'
import { createEmptyRuntimeInputDelta } from './input'

export type EditorRuntimeDeltaFlags = Partial<{
  graph: boolean
  ui: boolean
}>

export const createEditorRuntimeDelta = (
  input: EditorRuntimeDeltaFlags = {}
): EditorStateMutationDelta => (
  input.graph || input.ui
    ? createMutationResetDelta(editorStateMutationSchema)
    : createEmptyRuntimeInputDelta()
)

export const createMutationDelta = (input: {
  reset?: boolean
} = {}): WhiteboardMutationDelta => input.reset
  ? createMutationResetDelta(whiteboardMutationSchema)
  : createTypedMutationDelta(whiteboardMutationSchema)

export interface EditorGraphLayoutState {
  nodeMeasures?: ReadonlyMap<NodeId, NodeDraftMeasure>
  edgeLabelMeasures?: ReadonlyMap<EdgeId, ReadonlyMap<string, Size>>
}

const DEFAULT_LAYOUT_CATALOG: LayoutNodeCatalog = {
  text: 'size',
  sticky: 'fit',
  frame: 'none',
  shape: 'none',
  draw: 'none'
}

export const createEditorGraphLayout = (
  read: () => EditorGraphLayoutState
 ) => createWhiteboardLayout({
  nodes: DEFAULT_LAYOUT_CATALOG,
  backend: {
    measure: (request) => {
      const current = read()

      if (request.kind === 'size' && request.source?.kind === 'edge-label') {
        const size = current.edgeLabelMeasures
          ?.get(request.source.edgeId)
          ?.get(request.source.labelId)
        return size
          ? {
              kind: 'size',
              size
            }
          : undefined
      }

      if (request.source?.kind === 'node') {
        return current.nodeMeasures?.get(request.source.nodeId)
      }

      return undefined
    }
  }
})
