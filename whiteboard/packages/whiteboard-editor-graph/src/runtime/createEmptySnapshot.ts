import { document as documentApi } from '@whiteboard/core/document'
import type * as document from '@whiteboard/engine/contracts/document'
import {
  createFlags,
  createIds
} from '@shared/projection-runtime'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import { EMPTY_SCENE_LAYERS } from './helpers'

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
  },
  change: {
    root: createFlags(false),
    entities: {
      nodes: createIds(),
      edges: createIds(),
      owners: {
        mindmaps: createIds(),
        groups: createIds()
      }
    },
    relations: {
      graph: createFlags(false),
      ownership: createFlags(false),
      hierarchy: createFlags(false)
    }
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
  }
})

export const createEmptySnapshot = (): Snapshot => ({
  revision: 0,
  base: {
    documentRevision: 0,
    inputRevision: 0
  },
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
    selection: {
      target: {
        nodeIds: [],
        edgeIds: []
      },
      kind: 'none',
      summary: {
        count: 0,
        nodeCount: 0,
        edgeCount: 0,
        groupIds: []
      },
      affordance: {
        owner: 'none',
        moveHit: 'none',
        canMove: false,
        canResize: false,
        canRotate: false,
        handles: []
      }
    },
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
    }
  }
})
