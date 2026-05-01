import {
  createWhiteboardLayout,
  type LayoutNodeCatalog,
  type NodeDraftMeasure
} from '@whiteboard/core/layout'
import {
  createWhiteboardMutationDelta,
  type WhiteboardMutationDelta
} from '@whiteboard/engine/mutation'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import type { EditorDelta } from '@whiteboard/editor/protocol'
import { createEmptyRuntimeInputDelta } from './input'

const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as Record<string, never>

export type EditorRuntimeDeltaFlags = Partial<{
  graph: boolean
  ui: boolean
}>

export const createEditorRuntimeDelta = (
  input: EditorRuntimeDeltaFlags = {}
): EditorDelta => {
  const delta = createEmptyRuntimeInputDelta()

  if (input.graph) {
    delta.preview = {
      touchedNodeIds: ['__graph__' as NodeId],
      touchedEdgeIds: [],
      touchedMindmapIds: [],
      marquee: false,
      guides: false,
      draw: false,
      edgeGuide: false,
      hover: false
    }
  }
  if (input.ui) {
    delta.selection = true
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
  changes: EMPTY_MUTATION_CHANGES
})

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
