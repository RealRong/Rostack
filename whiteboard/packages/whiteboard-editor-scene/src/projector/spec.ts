import {
  type ProjectorSpec,
  type Revision
} from '@shared/projector'
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
  Change,
  Input,
  SceneItem,
  Snapshot,
  TextMeasure
} from '../contracts/editor'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import {
  createGraphDelta
} from '../contracts/delta'
import type { WorkingState } from '../contracts/working'
import { createSpatialDelta } from '../domain/spatial/update'
import { createSpatialState } from '../domain/spatial/state'
import { graphPhase } from '../phases/graph'
import { spatialPhase } from '../phases/spatial'
import { uiPhase } from '../phases/ui'
import { planEditorGraphPhases } from './impact'
import {
  createGraphPublishDelta,
  createUiPublishDelta,
  editorGraphPublisher
} from './publish'

export interface EditorGraphPhaseMetrics {
  count: number
}

export type EditorPhaseName = keyof EditorPhaseScopeMap & string

const createEmptyDocumentSnapshot = (): document.Snapshot => ({
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

export const createWorking = (input: {
  measure?: TextMeasure
} = {}): WorkingState => {
  const snapshot = createEmptyDocumentSnapshot()

  return {
    measure: input.measure,
    revision: {
      document: snapshot.revision as Revision
    },
    graph: {
      nodes: new Map(),
      edges: new Map(),
      owners: {
        mindmaps: new Map(),
        groups: new Map()
      }
    },
    indexes: {
      ownerByNode: new Map(),
      mindmapNodes: new Map(),
      parentByNode: new Map(),
      childrenByNode: new Map(),
      edgeNodesByEdge: new Map(),
      edgeIdsByNode: new Map(),
      groupItems: new Map(),
      groupSignature: new Map(),
      groupIdsBySignature: new Map(),
      groupByEdge: new Map()
    },
    spatial: createSpatialState(),
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
      nodes: new Map(),
      edges: new Map()
    },
    items: [],
    delta: {
      graph: createGraphDelta(),
      spatial: createSpatialDelta()
    },
    publish: {
      graph: {
        revision: 0,
        delta: createGraphPublishDelta()
      },
      ui: {
        revision: 0,
        delta: createUiPublishDelta()
      }
    }
  }
}

export const editorGraphProjectorSpec: ProjectorSpec<
  Input,
  WorkingState,
  Snapshot,
  Change,
  EditorPhaseName,
  EditorPhaseScopeMap,
  EditorGraphPhaseMetrics
> = {
  createWorking,
  createSnapshot: createEmptySnapshot,
  plan: planEditorGraphPhases,
  publish: editorGraphPublisher.publish,
  phases: [
    graphPhase,
    spatialPhase,
    uiPhase
  ]
}
