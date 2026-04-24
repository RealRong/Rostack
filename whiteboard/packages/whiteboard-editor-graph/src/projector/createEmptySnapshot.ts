import { idDelta } from '@shared/projector/delta'
import { document as documentApi } from '@whiteboard/core/document'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type {
  Input,
  SceneItem,
  Snapshot
} from '../contracts/editor'

export const createEmptyDocumentSnapshot = (): document.Snapshot => ({
  revision: 0,
  document: documentApi.create('__editor_graph_runtime__')
})

export const createEmptyInputDelta = (): Input['delta'] => ({
  document: {
    reset: false,
    order: false,
    nodes: idDelta.create<NodeId>(),
    edges: idDelta.create<EdgeId>(),
    mindmaps: idDelta.create<MindmapId>(),
    groups: idDelta.create<GroupId>()
  },
  graph: {
    nodes: {
      draft: idDelta.create<NodeId>(),
      preview: idDelta.create<NodeId>(),
      edit: idDelta.create<NodeId>()
    },
    edges: {
      preview: idDelta.create<EdgeId>(),
      edit: idDelta.create<EdgeId>()
    },
    mindmaps: {
      preview: idDelta.create<MindmapId>(),
      tick: new Set()
    }
  },
  ui: {
    tool: false,
    selection: false,
    hover: false,
    marquee: false,
    guides: false,
    draw: false,
    edit: false
  }
})

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
      nodes: new Map(),
      edges: new Map()
    },
    preview: {
      nodes: new Map(),
      edges: new Map(),
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
  measure: {
    text: {
      ready: false,
      nodes: new Map(),
      edgeLabels: new Map()
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
    }
  },
  clock: {
    now: 0
  },
  delta: createEmptyInputDelta()
})

export const createEmptySnapshot = (): Snapshot => ({
  revision: 0,
  documentRevision: 0,
  graph: {
    nodes: {
      ids: [],
      byId: new Map()
    },
    edges: {
      ids: [],
      byId: new Map()
    },
    owners: {
      mindmaps: {
        ids: [],
        byId: new Map()
      },
      groups: {
        ids: [],
        byId: new Map()
      }
    }
  },
  items: [] as readonly SceneItem[],
  ui: {
    chrome: {
      overlays: [],
      hover: {
        kind: 'none'
      },
      preview: {
        guides: [],
        draw: null,
        mindmap: null
      },
      edit: null
    },
    nodes: {
      ids: [],
      byId: new Map()
    },
    edges: {
      ids: [],
      byId: new Map()
    }
  }
})
