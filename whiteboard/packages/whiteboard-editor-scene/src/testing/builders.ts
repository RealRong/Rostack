import {
  createMutationChange,
} from '@shared/mutation'
import {
  createWhiteboardLayout,
  type LayoutNodeCatalog,
  type NodeDraftMeasure
} from '@whiteboard/core/layout'
import {
  createWhiteboardChange,
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'
import { createWhiteboardQuery } from '@whiteboard/core/query'
import type {
  WhiteboardChange
} from '@whiteboard/engine/mutation'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import type { EditorStateChange } from '@whiteboard/editor/state/runtime'
import { editorStateMutationSchema } from '@whiteboard/editor/state/model'
import { createEmptyRuntimeInputChange } from './input'

export type EditorRuntimeChangeFlags = Partial<{
  graph: boolean
  ui: boolean
}>

export const createEditorRuntimeChange = (
  input: EditorRuntimeChangeFlags = {}
): EditorStateChange => (
  input.graph || input.ui
    ? createMutationChange(editorStateMutationSchema, [], {
        reset: true
      })
    : createEmptyRuntimeInputChange()
)

export const createMutationChangeForDocument = (input: {
  reset?: boolean
} = {}): WhiteboardChange => createWhiteboardChange(
  createWhiteboardQuery(() => ({
    id: 'doc_scene_test',
    order: [],
    nodes: {},
    edges: {},
    groups: {},
    mindmaps: {}
  })),
  createMutationChange(whiteboardMutationSchema, [], {
    reset: input.reset
  })
)

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
