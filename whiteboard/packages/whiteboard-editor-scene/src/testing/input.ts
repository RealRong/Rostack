import { createChangeState, idDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../contracts/editor'
import { sceneInputChangeSpec } from '../contracts/change'
import { createEmptyDocumentSnapshot } from '../runtime/state'

export const createEmptyInputDelta = (): Input['delta'] => createChangeState(
  sceneInputChangeSpec
)

export const createEmptyInput = (): Input => ({
  document: {
    previous: null,
    snapshot: createEmptyDocumentSnapshot(),
    delta: {
      reset: false,
      background: false,
      order: false,
      nodes: idDelta.create<NodeId>(),
      edges: idDelta.create<EdgeId>(),
      mindmaps: idDelta.create<MindmapId>(),
      groups: idDelta.create<GroupId>()
    }
  },
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
  clock: {
    now: 0
  },
  delta: createEmptyInputDelta()
})
