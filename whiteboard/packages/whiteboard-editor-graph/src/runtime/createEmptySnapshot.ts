import { document as documentApi } from '@whiteboard/core/document'
import type * as document from '@whiteboard/engine/contracts/document'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import { EMPTY_SCENE_LAYERS } from './geometry'

export const createEmptyDocumentSnapshot = (): document.Snapshot => ({
  revision: 0,
  state: {
    root: documentApi.create('__editor_graph_runtime__'),
    facts: {
      entities: {
        nodes: new Map(),
        edges: new Map(),
        owners: {
          mindmaps: new Map(),
          groups: new Map()
        }
      },
      relations: {
        nodeOwner: new Map(),
        ownerNodes: {
          mindmaps: new Map(),
          groups: new Map()
        },
        parentNode: new Map(),
        childNodes: new Map(),
        edgeNodes: new Map(),
        groupItems: new Map()
      }
    }
  }
})

const createEmptyIdDelta = <TId extends string>(): document.IdDelta<TId> => ({
  added: new Set(),
  updated: new Set(),
  removed: new Set()
})

export const createEmptyInputDelta = (): Input['delta'] => ({
  document: {
    reset: false,
    order: false,
    nodes: createEmptyIdDelta(),
    edges: createEmptyIdDelta(),
    mindmaps: createEmptyIdDelta(),
    groups: createEmptyIdDelta()
  },
  graph: {
    nodes: {
      draft: createEmptyIdDelta(),
      preview: createEmptyIdDelta(),
      edit: createEmptyIdDelta()
    },
    edges: {
      preview: createEmptyIdDelta(),
      edit: createEmptyIdDelta()
    },
    mindmaps: {
      preview: createEmptyIdDelta(),
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
  },
  scene: {
    viewport: false
  }
})

export const createEmptyInput = (): Input => ({
  document: {
    snapshot: createEmptyDocumentSnapshot()
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
  viewport: {
    viewport: {
      center: {
        x: 0,
        y: 0
      },
      zoom: 1
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
  scene: {
    layers: EMPTY_SCENE_LAYERS,
    items: [],
    visible: {
      items: [],
      nodeIds: [],
      edgeIds: [],
      mindmapIds: []
    },
    spatial: {
      nodes: [],
      edges: [],
      mindmaps: []
    },
    pick: {
      items: []
    }
  },
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
