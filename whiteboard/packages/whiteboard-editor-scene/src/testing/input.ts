import { idDelta } from '@shared/delta'
import { EMPTY_MUTATION_CHANGE_MAP } from '@shared/mutation'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../contracts/editor'
import {
  createEmptyWhiteboardRuntimeDelta
} from '../contracts/execution'
import { createWhiteboardMutationDelta } from '../mutation/delta'
import { createEmptyDocumentSnapshot } from '../runtime/state'

export const createEmptyRuntimeInputDelta = (): Input['runtime']['delta'] => (
  createEmptyWhiteboardRuntimeDelta()
)

export const createEmptyInput = (): Input => ({
  document: {
    rev: 0,
    doc: createEmptyDocumentSnapshot().document
  },
  runtime: {
    session: {
      edit: null,
      draft: {
        edges: new Map()
      },
      preview: {
        nodes: new Map(),
        edges: new Map(),
        edgeGuide: undefined,
        draw: null,
        selection: {
          guides: []
        },
        mindmap: null
      },
      tool: {
        type: 'select'
      }
    },
    interaction: {
      selection: {
        nodeIds: [],
        edgeIds: []
      },
      hover: {
        kind: 'none'
      },
      drag: {
        kind: 'idle'
      },
      chrome: false,
      editingEdge: false
    },
    view: {
      zoom: 1,
      center: {
        x: 0,
        y: 0
      },
      worldRect: {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      }
    },
    clock: {
      now: 0
    },
    delta: createEmptyRuntimeInputDelta()
  },
  delta: createWhiteboardMutationDelta({
    changes: EMPTY_MUTATION_CHANGE_MAP
  })
})
